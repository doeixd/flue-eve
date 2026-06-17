import { describe, expect, it, vi } from "vitest";

import { createLoopbackAdmission } from "./loopback.js";

describe("createLoopbackAdmission", () => {
  it("POSTs message and yields streamed Flue events", async () => {
    const streamBody = JSON.stringify([
      { type: "text_delta", text: "Hi" },
      { type: "idle", submissionId: "sub_1" },
    ]);
    const streamHeaders = {
      "content-type": "application/json",
      "stream-next-offset": "0000000000000000_0000000000000002",
      "stream-up-to-date": "true",
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (method === "POST") {
        return Response.json({
          streamUrl: "http://127.0.0.1:3583/agents/assistant/ses_1",
          offset: "0000000000000000_0000000000000000",
          submissionId: "sub_1",
        });
      }

      if (url.includes("/agents/assistant/ses_1")) {
        return new Response(streamBody, { headers: streamHeaders });
      }

      return new Response("not found", { status: 404 });
    });

    const admission = createLoopbackAdmission({
      baseUrl: "http://127.0.0.1:3583",
      agentName: "assistant",
      fetch: fetchMock as typeof fetch,
    });

    const events = [];
    for await (const event of admission.admitTurn({
      agentName: "assistant",
      sessionId: "ses_1",
      message: "Hello",
      isFirstTurn: true,
    })) {
      events.push(event);
    }

    expect(fetchMock).toHaveBeenCalled();
    expect(events.map((event) => event.type)).toEqual(["text_delta", "idle"]);
  });

  it("forwards HITL and structured-output fields on admission POST", async () => {
    const bodies: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "POST") {
        bodies.push(String(init?.body));
        return Response.json({
          streamUrl: "http://127.0.0.1:3583/agents/assistant/ses_1",
          offset: "0",
        });
      }
      return new Response("[]", {
        headers: {
          "content-type": "application/json",
          "stream-next-offset": "1",
          "stream-up-to-date": "true",
        },
      });
    });

    const admission = createLoopbackAdmission({
      baseUrl: "http://127.0.0.1:3583",
      agentName: "assistant",
      fetch: fetchMock as typeof fetch,
    });

    for await (const _event of admission.admitTurn({
      agentName: "assistant",
      sessionId: "ses_1",
      message: "Resume",
      isFirstTurn: false,
      inputResponses: [{ requestId: "approval_1", optionId: "approve" }],
      outputSchema: { type: "object" },
      clientContext: { tab: "main" },
    })) {
      // drain
    }

    expect(JSON.parse(bodies[0]!)).toEqual({
      message: "Resume",
      inputResponses: [{ requestId: "approval_1", optionId: "approve" }],
      outputSchema: { type: "object" },
      clientContext: { tab: "main" },
    });
  });

  it("forwards string and string-array clientContext to Flue POST", async () => {
    const bodies: string[] = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "POST") {
        bodies.push(String(init?.body));
        return Response.json({
          streamUrl: "http://127.0.0.1:3583/agents/assistant/ses_1",
          offset: "0",
        });
      }
      return new Response("[]", {
        headers: {
          "content-type": "application/json",
          "stream-next-offset": "1",
          "stream-up-to-date": "true",
        },
      });
    });

    const admission = createLoopbackAdmission({
      baseUrl: "http://127.0.0.1:3583",
      agentName: "assistant",
      fetch: fetchMock as typeof fetch,
    });

    for await (const _event of admission.admitTurn({
      agentName: "assistant",
      sessionId: "ses_1",
      message: "Context",
      isFirstTurn: true,
      clientContext: "route: /editor",
    })) {
      // drain
    }

    for await (const _event of admission.admitTurn({
      agentName: "assistant",
      sessionId: "ses_1",
      message: "More context",
      isFirstTurn: false,
      clientContext: ["tab: chat", "modal: closed"],
    })) {
      // drain
    }

    expect(JSON.parse(bodies[0]!)).toEqual({
      message: "Context",
      clientContext: "route: /editor",
    });
    expect(JSON.parse(bodies[1]!)).toEqual({
      message: "More context",
      clientContext: ["tab: chat", "modal: closed"],
    });
  });

  it("yields an admission error when Flue POST fails", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "POST") {
        return new Response("agent unavailable", { status: 503 });
      }
      return new Response("not found", { status: 404 });
    });

    const admission = createLoopbackAdmission({
      baseUrl: "http://127.0.0.1:3583",
      agentName: "assistant",
      fetch: fetchMock as typeof fetch,
    });

    const events = [];
    for await (const event of admission.admitTurn({
      agentName: "assistant",
      sessionId: "ses_1",
      message: "Hello",
      isFirstTurn: true,
    })) {
      events.push(event);
    }

    expect(events).toEqual([
      expect.objectContaining({ type: "error", code: "admission_failed" }),
    ]);
  });
});