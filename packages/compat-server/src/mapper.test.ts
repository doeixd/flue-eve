import { describe, expect, it } from "vitest";

import { createMapContext, mapFlueToEve } from "./mapper.js";

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}

describe("mapFlueToEve", () => {
  it("maps text deltas and session.waiting", async () => {
    async function* flue() {
      yield { type: "text_delta", text: "Hi" };
      yield { type: "idle" };
    }

    const events = await collect(
      mapFlueToEve(
        flue(),
        createMapContext({
          sessionId: "ses_test",
          userMessage: "Hello",
          isFirstTurn: true,
        }),
      ),
    );

    const types = events.map((e) => e.type);
    expect(types).toContain("session.started");
    expect(types).toContain("message.received");
    expect(types).toContain("message.appended");
    expect(types).toContain("message.completed");
    expect(types).toContain("session.waiting");
  });

  it("renames mcp tool calls to connection__", async () => {
    async function* flue() {
      yield {
        type: "tool_start",
        toolCallId: "c1",
        toolName: "mcp__linear__list_issues",
        args: {},
      };
      yield {
        type: "tool",
        toolCallId: "c1",
        toolName: "mcp__linear__list_issues",
        result: { ok: true },
        isError: false,
        durationMs: 1,
      };
      yield { type: "idle" };
    }

    const events = await collect(
      mapFlueToEve(
        flue(),
        createMapContext({
          sessionId: "ses_test",
          userMessage: "List issues",
          isFirstTurn: false,
        }),
      ),
    );

    const requested = events.find((e) => e.type === "actions.requested");
    expect(requested?.data.actions).toEqual([
      expect.objectContaining({
        kind: "tool-call",
        toolName: "connection__linear__list_issues",
      }),
    ]);
  });

  it("maps hitl_requested to input.requested with connection tool rename", async () => {
    async function* flue() {
      yield {
        type: "hitl_requested",
        requests: [
          {
            requestId: "approval_1",
            action: {
              kind: "tool-call",
              callId: "call_1",
              toolName: "mcp__linear__list_issues",
              input: {},
            },
            display: "confirmation",
            options: [{ id: "approve", label: "Yes" }],
            prompt: "Approve?",
          },
        ],
      };
      yield { type: "idle" };
    }

    const events = await collect(
      mapFlueToEve(
        flue(),
        createMapContext({
          sessionId: "ses_test",
          userMessage: "Run tool",
          isFirstTurn: false,
        }),
      ),
    );

    const inputRequested = events.find((e) => e.type === "input.requested");
    expect(inputRequested?.data.requests).toEqual([
      expect.objectContaining({
        requestId: "approval_1",
        action: expect.objectContaining({
          toolName: "connection__linear__list_issues",
        }),
      }),
    ]);
    expect(events.at(-1)?.type).toBe("session.waiting");
  });

  it("maps tool_rejected to rejected action.result", async () => {
    async function* flue() {
      yield {
        type: "tool_rejected",
        toolCallId: "call_1",
        toolName: "bash",
        reason: "Denied by user",
      };
      yield { type: "idle" };
    }

    const events = await collect(
      mapFlueToEve(
        flue(),
        createMapContext({
          sessionId: "ses_test",
          userMessage: "",
          isFirstTurn: false,
          inputResponses: [{ requestId: "approval_1", optionId: "deny" }],
        }),
      ),
    );

    expect(events.some((e) => e.type === "message.received")).toBe(false);
    const result = events.find((e) => e.type === "action.result");
    expect(result?.data.status).toBe("rejected");
  });

  it("maps authorization_required without session.waiting", async () => {
    async function* flue() {
      yield {
        type: "authorization_required",
        name: "linear",
        description: "Linear workspace",
        authorization: { url: "https://idp.example.com/oauth" },
      };
      yield { type: "idle" };
    }

    const events = await collect(
      mapFlueToEve(
        flue(),
        createMapContext({
          sessionId: "ses_test",
          userMessage: "Search linear",
          isFirstTurn: false,
        }),
      ),
    );

    expect(events.some((event) => event.type === "authorization.required")).toBe(true);
    expect(events.at(-1)?.type).toBe("turn.completed");
    expect(events.some((event) => event.type === "session.waiting")).toBe(false);
  });

  it("maps result_completed to result.completed", async () => {
    async function* flue() {
      yield { type: "result_completed", result: { title: "Summary" } };
      yield { type: "idle" };
    }

    const events = await collect(
      mapFlueToEve(
        flue(),
        createMapContext({
          sessionId: "ses_test",
          userMessage: "Summarize",
          isFirstTurn: false,
        }),
      ),
    );

    const result = events.find((event) => event.type === "result.completed");
    expect(result?.data.result).toEqual({ title: "Summary" });
  });

  it("maps authorization_completed without ending the turn early", async () => {
    async function* flue() {
      yield {
        type: "authorization_completed",
        name: "linear",
        outcome: "authorized",
      };
      yield { type: "text_delta", text: "Connected." };
      yield { type: "idle" };
    }

    const events = await collect(
      mapFlueToEve(
        flue(),
        createMapContext({
          sessionId: "ses_test",
          userMessage: "Resume",
          isFirstTurn: false,
        }),
      ),
    );

    expect(events.some((event) => event.type === "authorization.completed")).toBe(true);
    expect(events.at(-1)?.type).toBe("session.waiting");
  });

  it("maps Flue error events to session.failed and stops", async () => {
    async function* flue() {
      yield { type: "error", code: "rate_limit", message: "Too many requests" };
    }

    const events = await collect(
      mapFlueToEve(
        flue(),
        createMapContext({
          sessionId: "ses_test",
          userMessage: "Hello",
          isFirstTurn: true,
        }),
      ),
    );

    const failed = events.find((event) => event.type === "session.failed");
    expect(failed?.data).toMatchObject({
      code: "rate_limit",
      message: "Too many requests",
    });
    expect(events.at(-1)?.type).toBe("session.failed");
    expect(events.some((event) => event.type === "session.waiting")).toBe(false);
  });

  it("maps tool start and result in the same turn", async () => {
    async function* flue() {
      yield {
        type: "tool_start",
        toolCallId: "c1",
        toolName: "grep",
        args: { pattern: "foo" },
      };
      yield {
        type: "tool",
        toolCallId: "c1",
        toolName: "grep",
        result: { matches: 2 },
        isError: false,
        durationMs: 5,
      };
      yield { type: "text_delta", text: "Found matches." };
      yield { type: "idle" };
    }

    const events = await collect(
      mapFlueToEve(
        flue(),
        createMapContext({
          sessionId: "ses_test",
          userMessage: "Search",
          isFirstTurn: false,
        }),
      ),
    );

    const types = events.map((event) => event.type);
    expect(types).toContain("actions.requested");
    expect(types).toContain("action.result");
    expect(types).toContain("message.appended");
    expect(types.at(-1)).toBe("session.waiting");
  });

  it("maps thinking_delta to reasoning.appended", async () => {
    async function* flue() {
      yield { type: "thinking_delta", delta: "Planning..." };
      yield { type: "idle" };
    }

    const events = await collect(
      mapFlueToEve(
        flue(),
        createMapContext({
          sessionId: "ses_test",
          userMessage: "Think",
          isFirstTurn: false,
        }),
      ),
    );

    expect(events.some((event) => event.type === "reasoning.appended")).toBe(true);
  });

  it("maps live MCP 401 tool errors to authorization.required", async () => {
    async function* flue() {
      yield {
        type: "tool",
        toolCallId: "call_1",
        toolName: "mcp__linear__list_issues",
        result: { status: 401, message: "Unauthorized" },
        isError: true,
        durationMs: 1,
      };
      yield { type: "idle" };
    }

    const events = await collect(
      mapFlueToEve(
        flue(),
        createMapContext({
          sessionId: "ses_test",
          userMessage: "List issues",
          isFirstTurn: false,
        }),
      ),
    );

    expect(events.some((event) => event.type === "authorization.required")).toBe(true);
    expect(events.some((event) => event.type === "action.result")).toBe(false);
    expect(events.some((event) => event.type === "session.waiting")).toBe(false);
    expect(events.at(-1)?.type).toBe("turn.completed");
  });

  it("accepts legacy hyphenated Flue event names", async () => {
    async function* flue() {
      yield { type: "text-delta", delta: "Hi" };
      yield {
        type: "tool-call",
        toolCallId: "c1",
        toolName: "grep",
        input: { pattern: "foo" },
      };
      yield {
        type: "tool-result",
        toolCallId: "c1",
        toolName: "grep",
        result: { matches: 1 },
        isError: false,
      };
      yield { type: "idle" };
    }

    const events = await collect(
      mapFlueToEve(
        flue(),
        createMapContext({
          sessionId: "ses_test",
          userMessage: "Search",
          isFirstTurn: false,
        }),
      ),
    );

    const types = events.map((event) => event.type);
    expect(types).toContain("message.appended");
    expect(types).toContain("actions.requested");
    expect(types).toContain("action.result");
  });

  it("omits session.started on follow-up turns", async () => {
    async function* flue() {
      yield { type: "text_delta", text: "Again" };
      yield { type: "idle" };
    }

    const events = await collect(
      mapFlueToEve(
        flue(),
        createMapContext({
          sessionId: "ses_test",
          userMessage: "Follow up",
          isFirstTurn: false,
        }),
      ),
    );

    expect(events.some((event) => event.type === "session.started")).toBe(false);
    expect(events.some((event) => event.type === "turn.started")).toBe(true);
  });
});