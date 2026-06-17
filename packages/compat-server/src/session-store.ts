import { EventJournal, type JournalOptions } from "./journal.js";
import {
  hydrateSession,
  serializeSession,
  type JournalPersistenceAdapter,
} from "./journal-persistence.js";
import type { EveSessionStatus } from "./types.js";

export interface EveSessionRecord {
  readonly sessionId: string;
  agentName: string;
  continuationToken: string;
  status: EveSessionStatus;
  readonly journal: EventJournal;
  readonly createdAt: number;
  updatedAt: number;
  isFirstTurn: boolean;
  pendingAuthorization?: { readonly connectionName: string };
}

export interface SessionStoreOptions {
  readonly persistence?: JournalPersistenceAdapter;
  readonly journal?: JournalOptions;
}

export class SessionStore {
  readonly #sessions = new Map<string, EveSessionRecord>();
  readonly #persistence?: JournalPersistenceAdapter;
  readonly #journalOptions?: JournalOptions;

  constructor(options: SessionStoreOptions = {}) {
    this.#persistence = options.persistence;
    this.#journalOptions = options.journal;
  }

  get(sessionId: string): EveSessionRecord | undefined {
    return this.#sessions.get(sessionId);
  }

  async resolve(sessionId: string): Promise<EveSessionRecord | undefined> {
    const cached = this.#sessions.get(sessionId);
    if (cached !== undefined) return cached;

    if (this.#persistence === undefined) return undefined;

    const persisted = await this.#persistence.load(sessionId);
    if (persisted === undefined) return undefined;

    const record = hydrateSession(persisted, this.#journalOptions);
    this.#sessions.set(sessionId, record);
    return record;
  }

  has(sessionId: string): boolean {
    return this.#sessions.has(sessionId);
  }

  create(input: {
    sessionId: string;
    agentName: string;
    continuationToken: string;
  }): EveSessionRecord {
    const record: EveSessionRecord = {
      sessionId: input.sessionId,
      agentName: input.agentName,
      continuationToken: input.continuationToken,
      status: "waiting",
      journal: new EventJournal(this.#journalOptions),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isFirstTurn: true,
    };
    this.#sessions.set(input.sessionId, record);
    void this.persist(record).catch((error) => {
      console.error(`[flue-eve] failed to persist session ${input.sessionId}:`, error);
    });
    return record;
  }

  async persist(session: EveSessionRecord): Promise<void> {
    if (this.#persistence === undefined) return;
    try {
      await this.#persistence.save(serializeSession(session));
    } catch (error) {
      console.error(`[flue-eve] persist failed for session ${session.sessionId}:`, error);
    }
  }

  delete(sessionId: string): void {
    this.#sessions.delete(sessionId);
    if (this.#persistence) {
      void this.#persistence.delete(sessionId).catch((error) => {
        console.error(`[flue-eve] failed to delete session ${sessionId}:`, error);
      });
    }
  }
}