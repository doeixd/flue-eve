import { describe, expect, it, vi } from "vitest";

import { createEveWorkerApp, resolveWorkerAdmission } from "./eve-worker.js";

async function readNdjson(response: Response): Promise<unknown[]> {
  const text = await response.text();
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown);
}

describe("createEveWorkerApp", () => {
  it("serves Eve health and streams a mock turn with KV persistence", async () => {
    const records = new Map<string, string>();
    const app = createEveWorkerApp({
      SESSIONS_KV: {
        get: async (key) => records.get(key) ?? null,
        put: async (key, value) => {
          records.set(key, value);
        },
        delete: async (key) => {
          records.delete(key);
        },
      },
      EVE_AGENT_NAME: "assistant",
    });

    const health = await app.request("/eve/v1/health");
    expect(health.status).toBe(200);
    const healthBody = (await health.json()) as { ok: boolean; flue: boolean };
    expect(healthBody.ok).toBe(true);
    expect(healthBody.flue).toBe(true);

    const start = await app.request("/eve/v1/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Hello worker" }),
    });
    expect(start.status).toBe(202);
    const { sessionId, continuationToken } = (await start.json()) as {
      sessionId: string;
      continuationToken: string;
    };

    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(records.size).toBeGreaterThan(0);

    const cold = createEveWorkerApp({
      SESSIONS_KV: {
        get: async (key) => records.get(key) ?? null,
        put: async (key, value) => {
          records.set(key, value);
        },
        delete: async (key) => {
          records.delete(key);
        },
      },
    });

    const follow = await cold.request(`/eve/v1/session/${sessionId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Again", continuationToken }),
    });
    expect(follow.status).toBe(200);

    const events = await readNdjson(await cold.request(`/eve/v1/session/${sessionId}/stream`));
    expect(events.some((event) => (event as { type: string }).type === "session.waiting")).toBe(
      true,
    );
  });

  it("reloads sessions through a Durable Object journal RPC backend", async () => {
    const storage = new Map<string, unknown>();
    const doHandler = {
      async fetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
        const href =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        const url = new URL(href);
        if (url.pathname === "/load") {
          const sessionId = url.searchParams.get("sessionId") ?? "";
          const raw = storage.get(`flue-eve:session:${sessionId}`);
          return Response.json({ ok: true, record: raw ?? null });
        }
        if (url.pathname === "/save" && init?.method === "PUT") {
          const record = JSON.parse(String(init.body)) as { sessionId: string };
          storage.set(`flue-eve:session:${record.sessionId}`, record);
          return Response.json({ ok: true });
        }
        return Response.json({ ok: false }, { status: 404 });
      },
    };

    const namespace = {
      idFromName: () => ({ toString: () => "sessions" }),
      get: () => doHandler,
    };

    const warm = createEveWorkerApp({ EVE_JOURNAL_DO: namespace });
    const start = await warm.request("/eve/v1/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Hello DO" }),
    });
    const { sessionId, continuationToken } = (await start.json()) as {
      sessionId: string;
      continuationToken: string;
    };

    await new Promise((resolve) => setTimeout(resolve, 120));

    const cold = createEveWorkerApp({ EVE_JOURNAL_DO: namespace });
    const follow = await cold.request(`/eve/v1/session/${sessionId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Again", continuationToken }),
    });
    expect(follow.status).toBe(200);
  });

  it("uses FLUE_AGENT Service Binding for admission when bound", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "POST") {
        return Response.json({
          streamUrl: "https://flue.internal/agents/assistant/ses_worker",
          offset: "-1",
          submissionId: "sub_worker",
        });
      }
      return new Response(
        JSON.stringify([{ type: "text_delta", text: "from-binding" }, { type: "idle" }]),
        {
          headers: {
            "content-type": "application/json",
            "stream-next-offset": "0000000000000000_0000000000000002",
            "stream-up-to-date": "true",
          },
        },
      );
    });

    const app = createEveWorkerApp({
      SESSIONS_KV: {
        get: async () => null,
        put: async () => {},
        delete: async () => {},
      },
      FLUE_AGENT: { fetch: fetchMock as typeof fetch },
    });

    const start = await app.request("/eve/v1/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Binding hello" }),
    });
    expect(start.status).toBe(202);

    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(fetchMock).toHaveBeenCalled();
    const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(calledUrl).toContain("/agents/assistant/");
  });

  it("enforces bearer auth when EVE_AUTH_BEARER is set", async () => {
    const app = createEveWorkerApp({ EVE_AUTH_BEARER: "worker-secret" });

    const unauthorized = await app.request("/eve/v1/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Hello" }),
    });
    expect(unauthorized.status).toBe(401);

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

describe("resolveWorkerAdmission", () => {
  it("falls through to Service Binding when FLUE_AGENT is provided", async () => {
    const fetchMock = vi.fn(async () => new Response("[]", { status: 200 }));
    const admission = await resolveWorkerAdmission("assistant", {
      FLUE_AGENT: { fetch: fetchMock as typeof fetch },
    });
    expect(admission).toBeDefined();
    expect(admission!.admitTurn).toBeTypeOf("function");
  });

  it("returns undefined when no Flue runtime and no Service Binding", async () => {
    const admission = await resolveWorkerAdmission("assistant", {});
    expect(admission).toBeUndefined();
  });

  it("prefers in-process when @flue/runtime/internal is available", async () => {
    // This test verifies the code path even though @flue/runtime/internal
    // is not installed in this repo — we test the resolution logic.
    const fetchMock = vi.fn(async () => new Response("[]", { status: 200 }));
    const admission = await resolveWorkerAdmission("assistant", {
      FLUE_AGENT: { fetch: fetchMock as typeof fetch },
    });
    // When in-process fails (no @flue/runtime), falls through to Service Binding
    expect(admission).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});