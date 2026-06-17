import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createSessionWaitingEvent } from "@flue-eve/shared";
import { afterEach, describe, expect, it } from "vitest";

import {
  createFileJournalPersistence,
  createKvJournalPersistence,
  createLazySqliteJournalPersistence,
  createMemoryJournalPersistence,
  createMemoryKvStore,
  resolveJournalPersistence,
  type PersistedSessionRecord,
} from "./journal-persistence.js";

const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);

function sampleRecord(sessionId: string): PersistedSessionRecord {
  const now = Date.now();
  return {
    sessionId,
    agentName: "assistant",
    continuationToken: "eve:token",
    status: "waiting",
    events: [createSessionWaitingEvent()],
    baseIndex: 0,
    nextIndex: 1,
    isFirstTurn: false,
    createdAt: now,
    updatedAt: now,
  };
}

describe("JournalPersistenceAdapter", () => {
  it("round-trips session snapshots through memory persistence", async () => {
    const persistence = createMemoryJournalPersistence();
    const record = sampleRecord("ses_persist");

    await persistence.save(record);
    await expect(persistence.load("ses_persist")).resolves.toEqual(record);
    await persistence.delete("ses_persist");
    await expect(persistence.load("ses_persist")).resolves.toBeUndefined();
  });

  it("round-trips session snapshots through file persistence", async () => {
    const directory = await mkdtemp(join(tmpdir(), "flue-eve-journal-"));
    const persistence = createFileJournalPersistence(directory);
    const record = sampleRecord("ses_file");

    try {
      await persistence.save(record);
      await expect(persistence.load("ses_file")).resolves.toEqual(record);
      await persistence.delete("ses_file");
      await expect(persistence.load("ses_file")).resolves.toBeUndefined();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("resolveJournalPersistence", () => {
  const previous = process.env.EVE_JOURNAL_PERSISTENCE;

  afterEach(() => {
    if (previous === undefined) delete process.env.EVE_JOURNAL_PERSISTENCE;
    else process.env.EVE_JOURNAL_PERSISTENCE = previous;
  });

  it("returns undefined when unset or none", () => {
    delete process.env.EVE_JOURNAL_PERSISTENCE;
    expect(resolveJournalPersistence()).toBeUndefined();
    expect(resolveJournalPersistence("none")).toBeUndefined();
  });

  it("returns memory adapter for memory mode", () => {
    expect(resolveJournalPersistence("memory")).toBeDefined();
  });

  it("returns file adapter for directory paths", () => {
    expect(resolveJournalPersistence("/tmp/flue-eve-journals")).toBeDefined();
  });

  it("returns sqlite adapter for sqlite: paths", () => {
    expect(resolveJournalPersistence("sqlite:/tmp/flue-eve.db")).toBeDefined();
  });

  it("returns redis adapter for redis:// URLs", () => {
    expect(resolveJournalPersistence("redis://127.0.0.1:6379")).toBeDefined();
  });

  it("throws when sqlite: has no path", () => {
    expect(() => resolveJournalPersistence("sqlite:")).toThrow(/requires a database file path/);
  });
});

describe.runIf(nodeMajor >= 22)("createLazySqliteJournalPersistence", () => {
  it("round-trips session snapshots", async () => {
    const directory = await mkdtemp(join(tmpdir(), "flue-eve-sqlite-"));
    const dbPath = join(directory, "sessions.db");
    const persistence = createLazySqliteJournalPersistence(dbPath);
    const record = sampleRecord("ses_sqlite");

    try {
      await persistence.save(record);
      await expect(persistence.load("ses_sqlite")).resolves.toEqual(record);
      await persistence.delete("ses_sqlite");
      await expect(persistence.load("ses_sqlite")).resolves.toBeUndefined();
    } finally {
      if ("close" in persistence && typeof persistence.close === "function") {
        persistence.close();
      }
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("createKvJournalPersistence", () => {
  it("round-trips session snapshots through a KV store", async () => {
    const persistence = createKvJournalPersistence(createMemoryKvStore());
    const record = sampleRecord("ses_kv");

    await persistence.save(record);
    await expect(persistence.load("ses_kv")).resolves.toEqual(record);
    await persistence.delete("ses_kv");
    await expect(persistence.load("ses_kv")).resolves.toBeUndefined();
  });
});