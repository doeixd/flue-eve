import { describe, expect, it } from "vitest";

import { createMockAdmission } from "./admission/mock.js";
import { eveCompat } from "./eve-compat.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createLazySqliteJournalPersistence,
  createMemoryJournalPersistence,
} from "./journal-persistence.js";

async function readNdjson(response: Response): Promise<unknown[]> {
  const text = await response.text();
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown);
}

describe("journal persistence e2e", () => {
  it("reloads a settled session from persistence on a cold compat instance", async () => {
    const persistence = createMemoryJournalPersistence();
    const admission = createMockAdmission();

    const warm = eveCompat({ agentName: "assistant", admission, persistence });
    const start = await warm.request("/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Hello" }),
    });
    const { sessionId, continuationToken } = (await start.json()) as {
      sessionId: string;
      continuationToken: string;
    };

    await new Promise((resolve) => setTimeout(resolve, 120));

    const cold = eveCompat({ agentName: "assistant", admission, persistence });

    const stream = await cold.request(`/session/${sessionId}/stream`);
    expect(stream.status).toBe(200);
    const events = await readNdjson(stream);
    expect(events.some((event) => (event as { type: string }).type === "session.waiting")).toBe(
      true,
    );

    const follow = await cold.request(`/session/${sessionId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Again", continuationToken }),
    });
    expect(follow.status).toBe(200);
  });

  it("reloads OAuth park state for callback and follow-up", async () => {
    const persistence = createMemoryJournalPersistence();

    const warm = eveCompat({
      agentName: "assistant",
      persistence,
      admission: {
        async *admitTurn() {
          yield {
            type: "authorization_required",
            name: "linear",
            description: "Linear",
            authorization: { url: "https://idp.example.com/oauth" },
          };
          yield { type: "idle" };
        },
      },
    });

    const start = await warm.request("/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Connect" }),
    });
    const { sessionId } = (await start.json()) as { sessionId: string };

    await new Promise((resolve) => setTimeout(resolve, 120));

    const cold = eveCompat({
      agentName: "assistant",
      persistence,
      admission: createMockAdmission(),
    });

    const callback = await cold.request(
      `/connections/linear/callback?sessionId=${encodeURIComponent(sessionId)}`,
    );
    expect(callback.status).toBe(200);

    const stream = await cold.request(`/session/${sessionId}/stream`);
    const events = await readNdjson(stream);
    expect(events.some((event) => (event as { type: string }).type === "authorization.completed")).toBe(
      true,
    );
    expect(events.some((event) => (event as { type: string }).type === "session.waiting")).toBe(
      true,
    );
  });

  it.runIf(Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10) >= 22)("reloads from SQLite persistence on a cold compat instance", async () => {
    const directory = await mkdtemp(join(tmpdir(), "flue-eve-persist-e2e-"));
    const dbPath = join(directory, "sessions.db");
    const persistence = createLazySqliteJournalPersistence(dbPath);
    const admission = createMockAdmission();

    try {
      const warm = eveCompat({ agentName: "assistant", admission, persistence });
      const start = await warm.request("/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "Hello" }),
      });
      const { sessionId, continuationToken } = (await start.json()) as {
        sessionId: string;
        continuationToken: string;
      };

      await new Promise((resolve) => setTimeout(resolve, 120));

      const cold = eveCompat({ agentName: "assistant", admission, persistence });
      const follow = await cold.request(`/session/${sessionId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "Again", continuationToken }),
      });
      expect(follow.status).toBe(200);
      await new Promise((resolve) => setTimeout(resolve, 120));
    } finally {
      if ("close" in persistence && typeof persistence.close === "function") {
        persistence.close();
      }
      await rm(directory, { recursive: true, force: true });
    }
  });
});