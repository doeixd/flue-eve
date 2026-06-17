import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { EveEvent } from "@flue-eve/shared";

import { EventJournal, type JournalOptions } from "./journal.js";
import { createLazyRedisJournalPersistence } from "./journal-persistence-redis.js";
import type { SqliteJournalPersistence } from "./journal-persistence-sqlite.js";
import type { EveSessionRecord } from "./session-store.js";
import type { EveSessionStatus } from "./types.js";

/** Serializable session snapshot for restart-safe journal replay (M6). */
export interface PersistedSessionRecord {
  readonly sessionId: string;
  readonly agentName: string;
  readonly continuationToken: string;
  readonly status: EveSessionStatus;
  readonly events: readonly EveEvent[];
  readonly baseIndex: number;
  readonly nextIndex: number;
  readonly isFirstTurn: boolean;
  readonly pendingAuthorization?: { readonly connectionName: string };
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** Pluggable journal/session store for production deploys (Redis, SQLite, DO). */
export interface JournalPersistenceAdapter {
  load(sessionId: string): Promise<PersistedSessionRecord | undefined>;
  save(record: PersistedSessionRecord): Promise<void>;
  delete(sessionId: string): Promise<void>;
}

export function serializeSession(session: EveSessionRecord): PersistedSessionRecord {
  const snapshot = session.journal.snapshot(0);
  return {
    sessionId: session.sessionId,
    agentName: session.agentName,
    continuationToken: session.continuationToken,
    status: session.status,
    events: snapshot.events,
    baseIndex: snapshot.baseIndex,
    nextIndex: snapshot.nextIndex,
    isFirstTurn: session.isFirstTurn,
    ...(session.pendingAuthorization !== undefined
      ? { pendingAuthorization: session.pendingAuthorization }
      : {}),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

export function hydrateSession(
  record: PersistedSessionRecord,
  journalOptions?: JournalOptions,
): EveSessionRecord {
  const journal = new EventJournal(journalOptions);
  journal.replaceState({
    events: record.events,
    baseIndex: record.baseIndex,
    nextIndex: record.nextIndex,
  });

  return {
    sessionId: record.sessionId,
    agentName: record.agentName,
    continuationToken: record.continuationToken,
    status: record.status,
    journal,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    isFirstTurn: record.isFirstTurn,
    pendingAuthorization: record.pendingAuthorization,
  };
}

/** In-memory persistence for tests and single-process dev with reload. */
export function createMemoryJournalPersistence(): JournalPersistenceAdapter {
  const records = new Map<string, PersistedSessionRecord>();

  return {
    async load(sessionId) {
      return records.get(sessionId);
    },
    async save(record) {
      records.set(record.sessionId, record);
    },
    async delete(sessionId) {
      records.delete(sessionId);
    },
  };
}

function sessionFilePath(directory: string, sessionId: string): string {
  const safe = sessionId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(directory, `${safe}.json`);
}

/** Defers `node:sqlite` import until first use (avoids experimental warning on unrelated loads). */
export function createLazySqliteJournalPersistence(dbPath: string): JournalPersistenceAdapter {
  let inner: SqliteJournalPersistence | undefined;
  let loading: Promise<SqliteJournalPersistence> | undefined;

  async function ensure(): Promise<SqliteJournalPersistence> {
    if (inner !== undefined) return inner;
    loading ??= import("./journal-persistence-sqlite.js").then((module) =>
      module.createSqliteJournalPersistence(dbPath),
    );
    inner = await loading;
    return inner;
  }

  const adapter: JournalPersistenceAdapter & { close?: () => void } = {
    load: async (sessionId) => (await ensure()).load(sessionId),
    save: async (record) => (await ensure()).save(record),
    async delete(sessionId) {
      const persistence = await ensure();
      await persistence.delete(sessionId);
    },
    close() {
      inner?.close();
    },
  };
  return adapter;
}

/** File-backed persistence for single-node Node deploys (one JSON file per session). */
export function createFileJournalPersistence(directory: string): JournalPersistenceAdapter {
  return {
    async load(sessionId) {
      try {
        const raw = await readFile(sessionFilePath(directory, sessionId), "utf8");
        return JSON.parse(raw) as PersistedSessionRecord;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw error;
      }
    },
    async save(record) {
      await mkdir(directory, { recursive: true });
      await writeFile(
        sessionFilePath(directory, record.sessionId),
        JSON.stringify(record),
        "utf8",
      );
    },
    async delete(sessionId) {
      try {
        await unlink(sessionFilePath(directory, sessionId));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    },
  };
}

/**
 * Resolve journal persistence from `EVE_JOURNAL_PERSISTENCE`:
 * - unset / `none` → undefined (in-memory only)
 * - `memory` → process-local Map
 * - `sqlite:<path>` → SQLite file (Node 22+ `node:sqlite`)
 * - `redis://…` → lazy Redis via optional `ioredis` peer
 * - any other value → directory path for file-backed persistence
 */
export function resolveJournalPersistence(
  mode = process.env.EVE_JOURNAL_PERSISTENCE,
): JournalPersistenceAdapter | undefined {
  if (mode === undefined || mode === "" || mode === "none") return undefined;
  if (mode === "memory") return createMemoryJournalPersistence();
  if (mode.startsWith("redis://") || mode.startsWith("rediss://")) {
    return createLazyRedisJournalPersistence(mode);
  }
  if (mode.startsWith("sqlite:")) {
    const dbPath = mode.slice("sqlite:".length);
    if (dbPath.length === 0) {
      throw new Error("EVE_JOURNAL_PERSISTENCE sqlite: requires a database file path.");
    }
    return createLazySqliteJournalPersistence(dbPath);
  }
  return createFileJournalPersistence(mode);
}

export {
  createCloudflareKvJournalPersistence,
  createCloudflareKvJournalStore,
  createDurableObjectJournalPersistence,
  type CloudflareDurableObjectStorage,
  type CloudflareKvNamespace,
} from "./journal-persistence-cloudflare.js";
export {
  createKvJournalPersistence,
  createMemoryKvStore,
  type JournalKvStore,
  type KvJournalPersistenceOptions,
} from "./journal-persistence-kv.js";
export {
  createLazyRedisJournalPersistence,
  createRedisJournalPersistence,
  type RedisJournalPersistence,
  type RedisLikeClient,
} from "./journal-persistence-redis.js";
export type { SqliteJournalPersistence } from "./journal-persistence-sqlite.js";
export {
  createDurableObjectJournalRpcPersistence,
  type DurableObjectJournalStub,
} from "./journal-persistence-do-rpc.js";