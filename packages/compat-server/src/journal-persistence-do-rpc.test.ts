import { describe, expect, it } from "vitest";

import { createDurableObjectJournalPersistence } from "./journal-persistence-cloudflare.js";
import { createDurableObjectJournalRpcPersistence } from "./journal-persistence-do-rpc.js";
import type { PersistedSessionRecord } from "./journal-persistence.js";

function sampleRecord(sessionId: string): PersistedSessionRecord {
  const now = Date.now();
  return {
    sessionId,
    agentName: "assistant",
    continuationToken: "eve:token",
    status: "waiting",
    events: [],
    baseIndex: 0,
    nextIndex: 0,
    isFirstTurn: false,
    createdAt: now,
    updatedAt: now,
  };
}

describe("createDurableObjectJournalRpcPersistence", () => {
  it("round-trips through a DO-style fetch handler", async () => {
    const storage = new Map<string, unknown>();
    const doPersistence = createDurableObjectJournalPersistence({
      get: async <T>(key: string) => storage.get(key) as T | undefined,
      put: async (key, value) => {
        storage.set(key, value);
      },
      delete: async (key) => {
        storage.delete(key);
      },
    });

    const stub = {
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
          const record = await doPersistence.load(sessionId);
          return Response.json({ ok: true, record: record ?? null });
        }
        if (url.pathname === "/save" && init?.method === "PUT") {
          const record = JSON.parse(String(init.body)) as PersistedSessionRecord;
          await doPersistence.save(record);
          return Response.json({ ok: true });
        }
        if (url.pathname === "/delete" && init?.method === "DELETE") {
          const sessionId = url.searchParams.get("sessionId") ?? "";
          await doPersistence.delete(sessionId);
          return Response.json({ ok: true });
        }
        return Response.json({ ok: false }, { status: 404 });
      },
    };

    const persistence = createDurableObjectJournalRpcPersistence(stub);
    const record = sampleRecord("ses_do_rpc");

    await persistence.save(record);
    await expect(persistence.load("ses_do_rpc")).resolves.toEqual(record);
    await persistence.delete("ses_do_rpc");
    await expect(persistence.load("ses_do_rpc")).resolves.toBeUndefined();
  });
});