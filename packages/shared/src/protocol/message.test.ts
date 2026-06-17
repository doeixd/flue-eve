// Adapted from vercel/eve packages/eve/src/protocol/message.test.ts (Apache-2.0)
import { describe, expect, it } from "vitest";

import { EVE_MESSAGE_STREAM_VERSION } from "../constants.js";
import {
  createResultCompletedEvent,
  createStepStartedEvent,
  createTurnStartedEvent,
} from "../events.js";
import {
  createActionResultEvent,
  createAuthorizationCompletedEvent,
  createAuthorizationRequiredEvent,
  createEveConnectionCallbackRoutePath,
  encodeMessageStreamEvent,
  timestampHandleMessageStreamEvent,
} from "../stream-protocol.js";

describe("message stream protocol", () => {
  it("pins the stream version for timed session events", () => {
    expect(EVE_MESSAGE_STREAM_VERSION).toBe("16");
  });

  it("creates result.completed events", () => {
    expect(
      createResultCompletedEvent({
        result: { title: "Done" },
        sequence: 1,
        stepIndex: 0,
        turnId: "turn_1",
      }),
    ).toEqual({
      data: { result: { title: "Done" }, sequence: 1, stepIndex: 0, turnId: "turn_1" },
      type: "result.completed",
    });
  });

  it("creates turn and step events", () => {
    expect(createTurnStartedEvent({ sequence: 0, turnId: "turn_1" })).toEqual({
      type: "turn.started",
      data: { sequence: 0, turnId: "turn_1" },
    });
    expect(createStepStartedEvent({ sequence: 0, stepIndex: 1, turnId: "turn_0" })).toEqual({
      type: "step.started",
      data: { sequence: 0, stepIndex: 1, turnId: "turn_0" },
    });
  });

  it("stamps durable timing metadata and preserves it through encoding", () => {
    const timed = timestampHandleMessageStreamEvent(
      createStepStartedEvent({ sequence: 0, stepIndex: 1, turnId: "turn_0" }),
      "2026-04-17T10:14:22.123Z",
    );

    expect(timed.meta).toEqual({ at: "2026-04-17T10:14:22.123Z" });

    const encoded = encodeMessageStreamEvent(timed);
    const decoded = JSON.parse(new TextDecoder().decode(encoded).trim()) as typeof timed;
    expect(decoded).toEqual(timed);
  });

  it("builds authorization.required with optional challenge and webhookUrl", () => {
    const bare = createAuthorizationRequiredEvent({
      name: "linear",
      description: "Linear",
      sequence: 3,
      stepIndex: 1,
      turnId: "turn_0",
    });
    expect(bare).toEqual({
      type: "authorization.required",
      data: {
        name: "linear",
        description: "Linear",
        sequence: 3,
        stepIndex: 1,
        turnId: "turn_0",
      },
    });

    const webhookUrl = `https://eve.example.com${createEveConnectionCallbackRoutePath("linear", "abc")}`;
    const full = createAuthorizationRequiredEvent({
      authorization: { url: "https://idp.example.com/authorize" },
      name: "linear",
      description: "Linear",
      sequence: 3,
      stepIndex: 1,
      turnId: "turn_0",
      webhookUrl,
    });
    expect(full.data.authorization).toEqual({ url: "https://idp.example.com/authorize" });
    expect(full.data.webhookUrl).toBe(webhookUrl);
  });

  it("builds authorization.completed with optional reason", () => {
    const authorized = createAuthorizationCompletedEvent({
      name: "linear",
      outcome: "authorized",
      sequence: 7,
      stepIndex: 1,
      turnId: "turn_0",
    });
    expect(authorized.data.reason).toBeUndefined();
    expect(authorized.data.outcome).toBe("authorized");

    const timedOut = createAuthorizationCompletedEvent({
      name: "linear",
      outcome: "timed-out",
      reason: "authorization_deadline_exceeded",
      sequence: 7,
      stepIndex: 1,
      turnId: "turn_0",
    });
    expect(timedOut.data.reason).toBe("authorization_deadline_exceeded");
  });

  it("builds authorization.completed with the journaled challenge", () => {
    const withoutChallenge = createAuthorizationCompletedEvent({
      name: "linear",
      outcome: "authorized",
      sequence: 7,
      stepIndex: 1,
      turnId: "turn_0",
    });
    expect(withoutChallenge.data).not.toHaveProperty("authorization");

    const withChallenge = createAuthorizationCompletedEvent({
      authorization: { displayName: "Linear", url: "https://idp.example.com/authorize" },
      name: "linear",
      outcome: "authorized",
      sequence: 7,
      stepIndex: 1,
      turnId: "turn_0",
    });
    expect(withChallenge.data.authorization).toEqual({
      displayName: "Linear",
      url: "https://idp.example.com/authorize",
    });
  });

  it("normalizes failed action results onto the event payload", () => {
    const event = createActionResultEvent({
      result: {
        callId: "call_weather",
        kind: "tool-result",
        output: '{"code":"TOOL_EXECUTION_FAILED","message":"Nope"}',
        toolName: "get_weather",
      },
      sequence: 0,
      stepIndex: 1,
      turnId: "turn_0",
    });

    expect(event.data).toEqual({
      error: { code: "TOOL_EXECUTION_FAILED", message: "Nope" },
      result: {
        callId: "call_weather",
        kind: "tool-result",
        output: '{"code":"TOOL_EXECUTION_FAILED","message":"Nope"}',
        toolName: "get_weather",
      },
      sequence: 0,
      status: "failed",
      stepIndex: 1,
      turnId: "turn_0",
    });
  });

  it("marks denied action results as rejected", () => {
    const event = createActionResultEvent({
      rejected: true,
      result: {
        callId: "approval-call",
        isError: true,
        kind: "tool-result",
        output: { code: "TOOL_EXECUTION_DENIED", message: "Tool execution was denied." },
        toolName: "bash",
      },
      sequence: 2,
      stepIndex: 0,
      turnId: "turn_0",
    });

    expect(event.data.status).toBe("rejected");
    expect(event.data.error).toEqual({
      code: "TOOL_EXECUTION_DENIED",
      message: "Tool execution was denied.",
    });
  });
});