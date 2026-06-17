import { describe, expect, it } from "vitest";

import {
  createMessageCompletedEvent,
  createSessionFailedEvent,
  createSessionWaitingEvent,
  createTurnStartedEvent,
} from "@flue-eve/shared";

import {
  advanceSession,
  createInitialSessionState,
  deriveResultStatus,
  extractCompletedMessage,
  extractInputRequests,
} from "./session-utils.js";

describe("advanceSession", () => {
  it("preserves session state when the turn ends at session.waiting", () => {
    const next = advanceSession({
      continuationToken: "eve:new",
      events: [createSessionWaitingEvent()],
      sessionId: "session_1",
      session: { continuationToken: "eve:old", sessionId: "session_1", streamIndex: 4 },
    });

    expect(next).toEqual({
      continuationToken: "eve:new",
      sessionId: "session_1",
      streamIndex: 5,
    });
  });

  it("resets session state when events end without a boundary", () => {
    const next = advanceSession({
      continuationToken: "eve:new",
      events: [createTurnStartedEvent({ sequence: 1, turnId: "turn_1" })],
      sessionId: "session_1",
      session: { continuationToken: "eve:old", sessionId: "session_1", streamIndex: 2 },
    });

    expect(next).toEqual(createInitialSessionState());
  });

  it("resets session state after session.failed", () => {
    const next = advanceSession({
      events: [createSessionFailedEvent({ code: "boom", message: "failed", sessionId: "session_1" })],
      sessionId: "session_1",
      session: { continuationToken: "eve:old", sessionId: "session_1", streamIndex: 3 },
    });

    expect(next).toEqual(createInitialSessionState());
  });

  it("accumulates streamIndex from a non-zero replay offset", () => {
    const next = advanceSession({
      events: [createSessionWaitingEvent()],
      sessionId: "session_1",
      session: { continuationToken: "eve:old", sessionId: "session_1", streamIndex: 10 },
    });

    expect(next.streamIndex).toBe(11);
  });

  it("keeps the prior continuation token when the response omits a new one", () => {
    const next = advanceSession({
      events: [createSessionWaitingEvent()],
      sessionId: "session_1",
      session: { continuationToken: "eve:stable", sessionId: "session_1", streamIndex: 0 },
    });

    expect(next.continuationToken).toBe("eve:stable");
  });
});

describe("deriveResultStatus", () => {
  it("returns waiting when session.waiting is the last boundary", () => {
    expect(
      deriveResultStatus([
        createTurnStartedEvent({ sequence: 1, turnId: "turn_1" }),
        createSessionWaitingEvent(),
      ]),
    ).toBe("waiting");
  });

  it("returns failed when session.failed is the last boundary", () => {
    expect(
      deriveResultStatus([createSessionFailedEvent({ code: "x", message: "y", sessionId: "test" })]),
    ).toBe("failed");
  });

  it("returns completed when no session boundary is present", () => {
    expect(deriveResultStatus([createTurnStartedEvent({ sequence: 1, turnId: "turn_1" })])).toBe(
      "completed",
    );
  });
});

describe("extractCompletedMessage", () => {
  it("skips tool-call finish reasons", () => {
    const message = extractCompletedMessage([
      createMessageCompletedEvent({
        finishReason: "tool-calls",
        message: "Calling tool",
        sequence: 1,
        stepIndex: 0,
        turnId: "turn_1",
      }),
      createMessageCompletedEvent({
        message: "Final answer",
        sequence: 2,
        stepIndex: 0,
        turnId: "turn_1",
      }),
    ]);

    expect(message).toBe("Final answer");
  });
});

describe("extractInputRequests", () => {
  it("collects requests from every input.requested event", () => {
    const requests = extractInputRequests([
      {
        type: "input.requested",
        data: {
          requests: [{ requestId: "a" }],
          sequence: 1,
          stepIndex: 0,
          turnId: "turn_1",
        },
      },
      {
        type: "input.requested",
        data: {
          requests: [{ requestId: "b" }],
          sequence: 2,
          stepIndex: 0,
          turnId: "turn_1",
        },
      },
    ]);

    expect(requests.map((request) => request.requestId)).toEqual(["a", "b"]);
  });
});