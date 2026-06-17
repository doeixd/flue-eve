import type { EveEvent } from "@flue-eve/shared";

import { createMapContext, mapFlueToEve } from "./mapper.js";
import type { EveSessionRecord, SessionStore } from "./session-store.js";
import type { InputResponse } from "./session-body.js";

import type { FlueAdmissionAdapter } from "./types.js";
import { recordStreamMapping } from "./otel.js";

export async function runTurn(input: {
  readonly session: EveSessionRecord;
  readonly message: string;
  readonly inputResponses?: readonly InputResponse[];
  readonly outputSchema?: Record<string, unknown>;
  readonly clientContext?: string | readonly string[] | Record<string, unknown>;
  readonly admission: FlueAdmissionAdapter;
  readonly store?: SessionStore;
}): Promise<void> {
  const { session, message, inputResponses, outputSchema, clientContext, admission, store } = input;

  const settle = (): void => {
    void store?.persist(session);
  };

  if (session.status === "active") return;

  session.status = "active";
  session.updatedAt = Date.now();

  const ctx = createMapContext({
    sessionId: session.sessionId,
    userMessage: message,
    isFirstTurn: session.isFirstTurn,
    inputResponses,
  });

  let eventCount = 0;
  let terminalStatus = "waiting";

  try {
    const flueStream = admission.admitTurn({
      agentName: session.agentName,
      sessionId: session.sessionId,
      message,
      isFirstTurn: session.isFirstTurn,
      inputResponses,
      outputSchema,
      clientContext,
    });

    for await (const event of mapFlueToEve(flueStream, ctx)) {
      eventCount += 1;
      session.journal.append(event);
      if (event.type === "authorization.required") {
        session.status = "active";
        session.pendingAuthorization = {
          connectionName: String(event.data.name ?? "connection"),
        };
        session.isFirstTurn = false;
        session.updatedAt = Date.now();
        settle();
        return;
      }
      if (event.type === "session.waiting") {
        session.pendingAuthorization = undefined;
        session.status = "waiting";
        session.isFirstTurn = false;
        session.updatedAt = Date.now();
        settle();
        return;
      }
      if (event.type === "session.failed") {
        session.status = "failed";
        terminalStatus = "failed";
        session.updatedAt = Date.now();
        settle();
        return;
      }
      if (event.type === "session.completed") {
        session.status = "completed";
        terminalStatus = "completed";
        session.updatedAt = Date.now();
        settle();
        return;
      }
    }

    session.status = "waiting";
    terminalStatus = "waiting";
    session.isFirstTurn = false;
    session.updatedAt = Date.now();
    settle();
  } catch (error) {
    terminalStatus = "failed";
    const messageText = error instanceof Error ? error.message : "Turn failed";
    const failed: EveEvent = {
      type: "session.failed",
      data: { code: "turn_failed", message: messageText, sessionId: session.sessionId },
    };
    session.journal.append(failed);
    session.status = "failed";
    session.updatedAt = Date.now();
    settle();
  } finally {
    recordStreamMapping(session.sessionId, session.agentName, eventCount);
  }
}