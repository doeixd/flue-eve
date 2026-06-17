// Adapted from vercel/eve packages/eve/src/client/session.test.ts (Apache-2.0)
import { afterEach, describe, expect, it, vi } from "vitest";

import { ClientSession } from "./session.js";
import {
  createEagerStreamResponse,
  createStartedMessageResponse,
} from "./test-fixtures.js";
import type { SessionState } from "./types.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function createSession(
  state: SessionState = { streamIndex: 0 },
  options: { readonly preserveCompletedSessions?: boolean } = {},
) {
  return new ClientSession(
    {
      host: "https://eve.test",
      maxReconnectAttempts: 0,
      preserveCompletedSessions: options.preserveCompletedSessions ?? false,
      async resolveHeaders() {
        return new Headers();
      },
    },
    state,
  );
}

function createAcceptedResponse() {
  return Response.json(
    { continuationToken: "eve:test", ok: true, sessionId: "session_1" },
    { status: 202 },
  );
}

describe("ClientSession", () => {
  it("serializes clientContext when sending a create-session message", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(createAcceptedResponse());
    const session = createSession();

    await session.send({
      clientContext: { selectedWord: "jazz" },
      message: "What word is selected?",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      clientContext: { selectedWord: "jazz" },
      message: "What word is selected?",
    });
  });

  it("serializes clientContext when continuing a session", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(createAcceptedResponse());
    const session = createSession({
      continuationToken: "eve:test",
      sessionId: "session_1",
      streamIndex: 0,
    });

    await session.send({
      clientContext: "approve button visible",
      inputResponses: [{ requestId: "approval_1", optionId: "approve" }],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      clientContext: "approve button visible",
      continuationToken: "eve:test",
      inputResponses: [{ requestId: "approval_1", optionId: "approve" }],
    });
  });

  it("rejects clientContext-only sends", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(createAcceptedResponse());
    const session = createSession({
      continuationToken: "eve:test",
      sessionId: "session_1",
      streamIndex: 0,
    });

    await expect(
      session.send({
        clientContext: { selectedWord: "jazz" },
      }),
    ).rejects.toThrow("Session.send requires a non-empty message, inputResponses, or both.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("continues the session after consuming through session.waiting", async () => {
    const requests: Array<{ body?: unknown; method: string; url: string }> = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (request, init) => {
      const url =
        typeof request === "string" ? request : request instanceof URL ? request.href : request.url;
      const method = init?.method ?? "GET";
      requests.push({
        body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
        method,
        url,
      });

      if (method === "POST") return createAcceptedResponse();
      return createEagerStreamResponse([
        { type: "session.waiting", data: { wait: "next-user-message" } },
      ]);
    });
    const session = createSession();

    const first = await session.send("first");
    for await (const _event of first) {
      // Drain stream so ClientSession advances its cursor.
    }
    await session.send("second");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const postRequests = requests.filter((request) => request.method === "POST");
    expect(new URL(postRequests[1]!.url).pathname).toBe("/eve/v1/session/session_1");
    expect(postRequests[1]!.body).toEqual({
      continuationToken: "eve:test",
      message: "second",
    });
  });

  it("resets the session by default after consuming through session.completed", async () => {
    const requests: Array<{ body?: unknown; method: string; url: string }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (request, init) => {
      const url =
        typeof request === "string" ? request : request instanceof URL ? request.href : request.url;
      const method = init?.method ?? "GET";
      requests.push({
        body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
        method,
        url,
      });

      if (method === "POST") return createAcceptedResponse();
      return createEagerStreamResponse([{ type: "session.completed", data: {} }]);
    });
    const session = createSession();

    await (await session.send("first")).result();
    await session.send("second");

    const postRequests = requests.filter((request) => request.method === "POST");
    expect(new URL(postRequests[1]!.url).pathname).toBe("/eve/v1/session");
    expect(postRequests[1]!.body).toEqual({ message: "second" });
  });

  it("continues the session after session.completed when configured", async () => {
    const requests: Array<{ body?: unknown; method: string; url: string }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (request, init) => {
      const url =
        typeof request === "string" ? request : request instanceof URL ? request.href : request.url;
      const method = init?.method ?? "GET";
      requests.push({
        body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
        method,
        url,
      });

      if (method === "POST") return createAcceptedResponse();
      return createEagerStreamResponse([{ type: "session.completed", data: {} }]);
    });
    const session = createSession({ streamIndex: 0 }, { preserveCompletedSessions: true });

    await (await session.send("first")).result();
    await session.send("second");

    const postRequests = requests.filter((request) => request.method === "POST");
    expect(new URL(postRequests[1]!.url).pathname).toBe("/eve/v1/session/session_1");
    expect(postRequests[1]!.body).toEqual({
      continuationToken: "eve:test",
      message: "second",
    });
  });

  it("drops session state when a turn is only partially consumed", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(createAcceptedResponse())
      .mockResolvedValueOnce(
        createEagerStreamResponse([
          { type: "turn.started", data: { sequence: 1, turnId: "turn_1" } },
          { type: "message.received", data: { message: "first", sequence: 1, turnId: "turn_1" } },
        ]),
      );

    const session = createSession();
    const response = await session.send("first");

    for await (const _event of response) {
      break;
    }

    expect(session.state).toEqual({ streamIndex: 0 });
    expect(() => session.stream()).toThrow("no session ID");
  });

  it("retries HITL delivery when the server reports a transient session-not-found", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response("target session was not found", { status: 500 }),
      )
      .mockResolvedValueOnce(createAcceptedResponse());

    const session = createSession({
      continuationToken: "eve:test",
      sessionId: "session_1",
      streamIndex: 0,
    });

    await session.send({
      inputResponses: [{ requestId: "approval_1", optionId: "approve" }],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(secondBody).toEqual({
      continuationToken: "eve:test",
      inputResponses: [{ requestId: "approval_1", optionId: "approve" }],
    });
  });

  it("does not retry ordinary message sends on 500", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("internal error", { status: 500 }));

    const session = createSession();

    await expect(session.send("hello")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns input requests emitted during the consumed turn", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_request, init) => {
      if ((init?.method ?? "GET") === "POST") return createAcceptedResponse();
      return createEagerStreamResponse([
        {
          type: "input.requested",
          data: {
            requests: [
              {
                action: { callId: "call_1", input: {}, kind: "tool-call", toolName: "bash" },
                prompt: "Approve?",
                requestId: "approval_1",
              },
            ],
            sequence: 1,
            stepIndex: 0,
            turnId: "turn_1",
          },
        },
        { type: "session.waiting", data: { wait: "next-user-message" } },
      ]);
    });
    const session = createSession();

    const result = await (await session.send("first")).result();
    expect(result.inputRequests.map((request) => request.requestId)).toEqual(["approval_1"]);
  });
});