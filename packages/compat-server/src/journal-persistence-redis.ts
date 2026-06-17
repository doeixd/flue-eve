import {
  createKvJournalPersistence,
  type JournalKvStore,
  type KvJournalPersistenceOptions,
} from "./journal-persistence-kv.js";
import type { JournalPersistenceAdapter } from "./journal-persistence.js";

/** Minimal Redis client surface (ioredis, node-redis, etc.). */
export interface RedisLikeClient {
  get(key: string): Promise<string | null | undefined>;
  set(key: string, value: string): Promise<unknown>;
  del(key: string): Promise<unknown>;
  quit?(): Promise<unknown>;
  disconnect?(): Promise<unknown>;
}

export interface RedisJournalPersistence extends JournalPersistenceAdapter {
  close(): Promise<void>;
}

export function createRedisJournalPersistence(
  client: RedisLikeClient,
  options?: KvJournalPersistenceOptions,
): RedisJournalPersistence {
  const kv: JournalKvStore = {
    get: (key) => client.get(key),
    set: async (key, value) => {
      await client.set(key, value);
    },
    del: async (key) => {
      await client.del(key);
    },
  };

  const persistence = createKvJournalPersistence(kv, options);

  return {
    ...persistence,
    async close() {
      if (client.quit !== undefined) {
        await client.quit();
        return;
      }
      if (client.disconnect !== undefined) {
        await client.disconnect();
      }
    },
  };
}

async function loadRedisClient(url: string): Promise<RedisLikeClient> {
  const mod = (await import("ioredis").catch(() => undefined)) as
    | { default: new (url: string) => RedisLikeClient }
    | undefined;

  if (mod?.default === undefined) {
    throw new Error(
      "ioredis is required for redis: journal persistence. Install it: pnpm add ioredis",
    );
  }

  return new mod.default(url);
}

/**
 * Lazy Redis journal persistence — connects on first load/save/delete.
 * Use with `EVE_JOURNAL_PERSISTENCE=redis://127.0.0.1:6379`.
 */
export function createLazyRedisJournalPersistence(
  url: string,
  options?: KvJournalPersistenceOptions,
): RedisJournalPersistence {
  let clientPromise: Promise<RedisLikeClient> | undefined;
  let client: RedisLikeClient | undefined;

  async function resolveClient(): Promise<RedisLikeClient> {
    if (client !== undefined) return client;
    clientPromise ??= loadRedisClient(url);
    client = await clientPromise;
    return client;
  }

  const inner = createRedisJournalPersistence(
    {
      get: async (key) => (await resolveClient()).get(key),
      set: async (key, value) => {
        await (await resolveClient()).set(key, value);
      },
      del: async (key) => {
        await (await resolveClient()).del(key);
      },
    },
    options,
  );

  return {
    load: (sessionId) => inner.load(sessionId),
    save: (record) => inner.save(record),
    delete: (sessionId) => inner.delete(sessionId),
    close: async () => {
      if (client !== undefined) {
        await inner.close();
        client = undefined;
        clientPromise = undefined;
      }
    },
  };
}