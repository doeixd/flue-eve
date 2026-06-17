import type { JournalPersistenceAdapter, PersistedSessionRecord } from "./journal-persistence.js";

/** Minimal async KV surface for Redis, Cloudflare KV, or in-process stores. */
export interface JournalKvStore {
  get(key: string): Promise<string | null | undefined>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
}

export interface KvJournalPersistenceOptions {
  readonly prefix?: string;
}

/** KV-backed journal persistence (Redis, DO KV, or any JournalKvStore implementation). */
export function createKvJournalPersistence(
  kv: JournalKvStore,
  options: KvJournalPersistenceOptions = {},
): JournalPersistenceAdapter {
  const prefix = options.prefix ?? "flue-eve:session:";

  function key(sessionId: string): string {
    return `${prefix}${sessionId}`;
  }

  return {
    async load(sessionId) {
      const raw = await kv.get(key(sessionId));
      if (raw === null || raw === undefined || raw.length === 0) return undefined;
      return JSON.parse(raw) as PersistedSessionRecord;
    },
    async save(record) {
      await kv.set(key(record.sessionId), JSON.stringify(record));
    },
    async delete(sessionId) {
      await kv.del(key(sessionId));
    },
  };
}

/** In-memory KV store for tests and dev. */
export function createMemoryKvStore(): JournalKvStore {
  const records = new Map<string, string>();
  return {
    async get(key) {
      return records.get(key);
    },
    async set(key, value) {
      records.set(key, value);
    },
    async del(key) {
      records.delete(key);
    },
  };
}