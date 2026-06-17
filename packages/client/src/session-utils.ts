import { isCurrentTurnBoundaryEvent, type EveEvent } from "@flue-eve/shared";

import type { SessionState } from "./types.js";

export function createInitialSessionState(): SessionState {
  return { streamIndex: 0 };
}

export function advanceSession(input: {
  readonly continuationToken?: string;
  readonly events: readonly EveEvent[];
  readonly preserveCompletedSessions?: boolean;
  readonly sessionId: string;
  readonly session: SessionState;
}): SessionState {
  const boundaryEvent = findBoundaryEvent(input.events);
  const streamIndex = input.session.streamIndex + input.events.length;

  if (
    boundaryEvent?.type === "session.waiting" ||
    (input.preserveCompletedSessions === true && boundaryEvent?.type === "session.completed")
  ) {
    return {
      continuationToken: input.continuationToken ?? input.session.continuationToken,
      sessionId: input.sessionId,
      streamIndex,
    };
  }

  return createInitialSessionState();
}

export function extractCompletedMessage(events: readonly EveEvent[]): string | undefined {
  let lastMessage: string | undefined;
  for (const event of events) {
    if (
      event.type === "message.completed" &&
      event.data.finishReason !== "tool-calls" &&
      typeof event.data.message === "string"
    ) {
      lastMessage = event.data.message;
    }
  }
  return lastMessage;
}

export function deriveResultStatus(
  events: readonly EveEvent[],
): "completed" | "failed" | "waiting" {
  const boundary = findBoundaryEvent(events);
  if (boundary?.type === "session.waiting") return "waiting";
  if (boundary?.type === "session.failed") return "failed";
  return "completed";
}

export function extractInputRequests(events: readonly EveEvent[]): readonly Record<string, unknown>[] {
  const requests: Record<string, unknown>[] = [];
  for (const event of events) {
    if (event.type === "input.requested" && Array.isArray(event.data.requests)) {
      requests.push(...(event.data.requests as Record<string, unknown>[]));
    }
  }
  return requests;
}

function findBoundaryEvent(events: readonly EveEvent[]): EveEvent | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event !== undefined && isCurrentTurnBoundaryEvent(event)) return event;
  }
  return undefined;
}