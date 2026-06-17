import { describe, expect, it } from "vitest";

import { EventJournal } from "./journal.js";
import { createMemoryJournalPersistence } from "./journal-persistence.js";
import { SessionStore, type EveSessionRecord } from "./session-store.js";
import { runTurn } from "./turn-runner.js";
import type { FlueAdmissionAdapter } from "./types.js";

function createSession(overrides?: Partial<EveSessionRecord>): EveSessionRecord {
  return {
    sessionId: "ses_test",
    agentName: "assistant",
    continuationToken: "eve:token",
    status: "waiting",
    journal: new EventJournal(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isFirstTurn: true,
    ...overrides,
  };
}

describe("runTurn", () => {
  it("ignores duplicate invocations while the session is active", async () => {
    const session = createSession({ status: "active" });
    let admitCalls = 0;

    const admission: FlueAdmissionAdapter = {
      async *admitTurn() {
        admitCalls += 1;
        yield { type: "text_delta", text: "should not run" };
        yield { type: "idle" };
      },
    };

    await runTurn({ session, message: "Hello", admission });

    expect(admitCalls).toBe(0);
    expect(session.journal.nextIndex).toBe(0);
    expect(session.status).toBe("active");
  });

  it("marks the session failed and journals session.failed when admission throws", async () => {
    const session = createSession();
    const admission: FlueAdmissionAdapter = {
      async *admitTurn() {
        throw new Error("Admission exploded");
      },
    };

    await runTurn({ session, message: "Hello", admission });

    const events = session.journal.snapshot(0).events;
    expect(session.status).toBe("failed");
    expect(events.some((event) => event.type === "session.failed")).toBe(true);
  });

  it("keeps the session active when authorization is required", async () => {
    const session = createSession();
    const admission: FlueAdmissionAdapter = {
      async *admitTurn() {
        yield {
          type: "authorization_required",
          name: "linear",
          description: "Linear",
          authorization: { url: "https://idp.example.com/oauth" },
        };
        yield { type: "idle" };
      },
    };

    await runTurn({ session, message: "Connect", admission });

    expect(session.status).toBe("active");
    expect(session.pendingAuthorization).toEqual({ connectionName: "linear" });
    expect(session.journal.snapshot(0).events.some((e) => e.type === "authorization.required")).toBe(
      true,
    );
    expect(session.journal.snapshot(0).events.some((e) => e.type === "session.waiting")).toBe(false);
    expect(session.isFirstTurn).toBe(false);
  });

  it("clears pending authorization when the turn reaches session.waiting", async () => {
    const session = createSession({
      pendingAuthorization: { connectionName: "linear" },
      isFirstTurn: false,
    });
    const admission: FlueAdmissionAdapter = {
      async *admitTurn() {
        yield { type: "text_delta", text: "Done" };
        yield { type: "idle" };
      },
    };

    await runTurn({ session, message: "Resume", admission });

    expect(session.status).toBe("waiting");
    expect(session.pendingAuthorization).toBeUndefined();
  });

  it("persists session state through the store on turn settlement", async () => {
    const persistence = createMemoryJournalPersistence();
    const store = new SessionStore({ persistence });
    const session = store.create({
      sessionId: "ses_persist_turn",
      agentName: "assistant",
      continuationToken: "eve:persist",
    });

    await runTurn({
      session,
      message: "Hi",
      admission: {
        async *admitTurn() {
          yield { type: "text_delta", text: "Hello" };
          yield { type: "idle" };
        },
      },
      store,
    });

    const reloaded = await persistence.load("ses_persist_turn");
    expect(reloaded?.status).toBe("waiting");
    expect(reloaded?.nextIndex).toBeGreaterThan(0);
  });
});