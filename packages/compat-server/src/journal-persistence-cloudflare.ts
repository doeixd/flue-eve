import {
  createKvJournalPersistence,
  type JournalKvStore,
  type KvJournalPersistenceOptions,
} from "./journal-persistence-kv.js";
import type { JournalPersistenceAdapter } from "./journal-persistence.js";

/** Cloudflare Workers KV namespace binding. */
export interface CloudflareKvNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Cloudflare Durable Object storage binding (M7 session journal). */
export interface CloudflareDurableObjectStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

export function createCloudflareKvJournalStore(kv: CloudflareKvNamespace): JournalKvStore {
  return {
    get: (key) => kv.get(key),
    set: (key, value) => kv.put(key, value),
    del: (key) => kv.delete(key),
  };
}

export function createCloudflareKvJournalPersistence(
  kv: CloudflareKvNamespace,
  options?: KvJournalPersistenceOptions,
): JournalPersistenceAdapter {
  return createKvJournalPersistence(createCloudflareKvJournalStore(kv), options);
}

export function createDurableObjectJournalPersistence(
  storage: CloudflareDurableObjectStorage,
  options?: KvJournalPersistenceOptions,
): JournalPersistenceAdapter {
  const prefix = options?.prefix ?? "flue-eve:session:";

  function key(sessionId: string): string {
    return `${prefix}${sessionId}`;
  }

  return {
    async load(sessionId) {
      const record = await storage.get(key(sessionId));
      if (record === undefined || record === null) return undefined;
      return record as import("./journal-persistence.js").PersistedSessionRecord;
    },
    async save(record) {
      await storage.put(key(record.sessionId), record);
    },
    async delete(sessionId) {
      await storage.delete(key(sessionId));
    },
  };
}