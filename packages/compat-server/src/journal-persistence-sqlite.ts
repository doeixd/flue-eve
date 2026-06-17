import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { JournalPersistenceAdapter, PersistedSessionRecord } from "./journal-persistence.js";

export interface SqliteJournalPersistence extends JournalPersistenceAdapter {
  close(): void;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS eve_sessions (
  session_id TEXT PRIMARY KEY NOT NULL,
  record_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

/** SQLite-backed persistence via Node 22+ `node:sqlite` (single-file, restart-safe). */
export function createSqliteJournalPersistence(dbPath: string): SqliteJournalPersistence {
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec(SCHEMA);

  const selectStmt = db.prepare(
    "SELECT record_json FROM eve_sessions WHERE session_id = ?",
  );
  const upsertStmt = db.prepare(`
    INSERT INTO eve_sessions (session_id, record_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      record_json = excluded.record_json,
      updated_at = excluded.updated_at
  `);
  const deleteStmt = db.prepare("DELETE FROM eve_sessions WHERE session_id = ?");

  return {
    async load(sessionId) {
      const row = selectStmt.get(sessionId) as { record_json: string } | undefined;
      if (row === undefined) return undefined;
      return JSON.parse(row.record_json) as PersistedSessionRecord;
    },
    async save(record) {
      upsertStmt.run(record.sessionId, JSON.stringify(record), record.updatedAt);
    },
    async delete(sessionId) {
      deleteStmt.run(sessionId);
    },
    close() {
      db.close();
    },
  };
}