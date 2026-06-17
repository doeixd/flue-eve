import { describe, expect, it } from "vitest";

import {
  createCloudflareKvJournalPersistence,
  createDurableObjectJournalPersistence,
} from "./journal-persistence-cloudflare.js";
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

describe("Cloudflare journal persistence", () => {
  it("round-trips through a KV namespace binding", async () => {
    const records = new Map<string, string>();
    const persistence = createCloudflareKvJournalPersistence({
      get: async (key) => records.get(key) ?? null,
      put: async (key, value) => {
        records.set(key, value);
      },
      delete: async (key) => {
        records.delete(key);
      },
    });

    const record = sampleRecord("ses_cf_kv");
    await persistence.save(record);
    await expect(persistence.load("ses_cf_kv")).resolves.toEqual(record);
  });

  it("round-trips through Durable Object storage", async () => {
    const records = new Map<string, unknown>();
    const persistence = createDurableObjectJournalPersistence({
      get: async <T>(key: string) => records.get(key) as T | undefined,
      put: async (key, value) => {
        records.set(key, value);
      },
      delete: async (key) => {
        records.delete(key);
      },
    });

    const record = sampleRecord("ses_cf_do");
    await persistence.save(record);
    await expect(persistence.load("ses_cf_do")).resolves.toEqual(record);
  });
});