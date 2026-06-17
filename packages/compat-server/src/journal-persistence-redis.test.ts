import { describe, expect, it } from "vitest";

import { createRedisJournalPersistence } from "./journal-persistence-redis.js";
import type { PersistedSessionRecord } from "./journal-persistence.js";
import { resolveJournalPersistence } from "./journal-persistence.js";

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

describe("createRedisJournalPersistence", () => {
  it("round-trips session snapshots through a Redis-like client", async () => {
    const records = new Map<string, string>();
    const persistence = createRedisJournalPersistence({
      get: async (key) => records.get(key) ?? null,
      set: async (key, value) => {
        records.set(key, value);
      },
      del: async (key) => {
        records.delete(key);
      },
    });

    const record = sampleRecord("ses_redis");
    await persistence.save(record);
    await expect(persistence.load("ses_redis")).resolves.toEqual(record);
    await persistence.delete("ses_redis");
    await expect(persistence.load("ses_redis")).resolves.toBeUndefined();
  });
});

describe("resolveJournalPersistence redis mode", () => {
  it("returns lazy redis adapter for redis:// URLs", () => {
    expect(resolveJournalPersistence("redis://127.0.0.1:6379")).toBeDefined();
    expect(resolveJournalPersistence("rediss://user:pass@redis.example:6380")).toBeDefined();
  });
});