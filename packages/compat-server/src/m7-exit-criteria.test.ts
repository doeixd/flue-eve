import { describe, expect, it } from "vitest";

import { createEveWorkerApp } from "./eve-worker.js";

async function readNdjson(response: Response): Promise<unknown[]> {
  const text = await response.text();
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown);
}

function createKvBindings(records = new Map<string, string>()) {
  return {
    SESSIONS_KV: {
      get: async (key: string) => records.get(key) ?? null,
      put: async (key: string, value: string) => {
        records.set(key, value);
      },
      delete: async (key: string) => {
        records.delete(key);
      },
    },
    EVE_AGENT_NAME: "assistant",
  };
}

describe("M7 exit criteria", () => {
  it("replays multiple turns after a cold Worker restart with KV persistence", async () => {
    const records = new Map<string, string>();
    const bindings = createKvBindings(records);

    const warm = createEveWorkerApp(bindings);
    const start = await warm.request("/eve/v1/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Turn one" }),
    });
    expect(start.status).toBe(202);
    const { sessionId, continuationToken } = (await start.json()) as {
      sessionId: string;
      continuationToken: string;
    };

    await new Promise((resolve) => setTimeout(resolve, 120));

    const cold = createEveWorkerApp(createKvBindings(records));
    for (const message of ["Turn two", "Turn three"]) {
      const follow = await cold.request(`/eve/v1/session/${sessionId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, continuationToken }),
      });
      expect(follow.status).toBe(200);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }

    const replay = await readNdjson(
      await cold.request(`/eve/v1/session/${sessionId}/stream?startIndex=0`),
    );
    const received = replay.filter(
      (event) => (event as { type: string }).type === "message.received",
    );

    expect(received).toHaveLength(3);
    expect(
      received.map((event) => (event as { data: { message: string } }).data.message),
    ).toEqual(["Turn one", "Turn two", "Turn three"]);
  });

  it("returns 410 when follow-up targets a terminal failed session on Worker", async () => {
    const records = new Map<string, string>();
    const app = createEveWorkerApp(createKvBindings(records), {
      admission: {
        async *admitTurn() {
          yield { type: "error", code: "agent_error", message: "Simulated failure" };
        },
      },
    });

    const start = await app.request("/eve/v1/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Fail me" }),
    });
    const { sessionId, continuationToken } = (await start.json()) as {
      sessionId: string;
      continuationToken: string;
    };

    let follow: Response | undefined;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      follow = await app.request(`/eve/v1/session/${sessionId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "Too late", continuationToken }),
      });
      if (follow.status === 410) break;
    }

    expect(follow?.status).toBe(410);
  });

  it("fails closed on protected Worker routes when EVE_AUTH_BEARER is set", async () => {
    const app = createEveWorkerApp({
      ...createKvBindings(),
      EVE_AUTH_BEARER: "worker-secret",
    });

    expect((await app.request("/eve/v1/health")).status).toBe(200);
    expect(
      (
        await app.request("/eve/v1/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: "Hello" }),
        })
      ).status,
    ).toBe(401);

    const authorized = await app.request("/eve/v1/session", {
      method: "POST",
      headers: {
        authorization: "Bearer worker-secret",
        "content-type": "application/json",
      },
      body: JSON.stringify({ message: "Hello" }),
    });
    expect(authorized.status).toBe(202);
  });
});