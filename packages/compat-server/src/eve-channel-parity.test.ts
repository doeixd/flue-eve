// Adapted from vercel/eve packages/eve/src/public/channels/eve.test.ts (Apache-2.0)
// HTTP request/response contract subset for @flue-eve/compat-server.
import { describe, expect, it } from "vitest";

import { createMockAdmission } from "./admission/mock.js";
import { eveCompat } from "./eve-compat.js";

function jsonRequest(
  path: string,
  body: unknown,
  init: RequestInit = {},
): Request {
  return new Request(`http://127.0.0.1${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(init.headers as Record<string, string>) },
    body: JSON.stringify(body),
    ...init,
  });
}

describe("eveCompat HTTP parity (Eve channel subset)", () => {
  it("accepts a plain-string message and opens a new session with 202", async () => {
    const app = eveCompat({ agentName: "assistant" });
    const response = await app.request(
      jsonRequest("/session", { message: "hi" }),
    );

    expect(response.status).toBe(202);
    const body = (await response.json()) as { ok: boolean; sessionId: string };
    expect(body.ok).toBe(true);
    expect(body.sessionId).toMatch(/^ses_/);
  });

  it("rejects invalid JSON bodies with 400", async () => {
    const app = eveCompat({ agentName: "assistant" });
    const response = await app.request(
      new Request("http://127.0.0.1/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not-json",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ ok: false });
  });

  it("rejects non-object payloads with 400", async () => {
    const app = eveCompat({ agentName: "assistant" });
    const response = await app.request(jsonRequest("/session", 42));
    expect(response.status).toBe(400);
  });

  it("treats an empty string as a missing message", async () => {
    const app = eveCompat({ agentName: "assistant" });
    const response = await app.request(jsonRequest("/session", { message: "" }));
    expect(response.status).toBe(400);
  });

  it("forwards outputSchema with a create-session message", async () => {
    const captured: Array<Record<string, unknown>> = [];
    const app = eveCompat({
      agentName: "assistant",
      admission: {
        async *admitTurn(input) {
          captured.push({
            message: input.message,
            outputSchema: input.outputSchema,
          });
          yield { type: "idle" };
        },
      },
    });

    const outputSchema = {
      properties: { title: { type: "string" } },
      required: ["title"],
      type: "object",
    };

    const response = await app.request(
      jsonRequest("/session", { message: "Summarize", outputSchema }),
    );
    expect(response.status).toBe(202);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(captured[0]).toMatchObject({ message: "Summarize", outputSchema });
  });

  it("rejects invalid create-session outputSchema values", async () => {
    const app = eveCompat({ agentName: "assistant" });
    const response = await app.request(
      jsonRequest("/session", { message: "Summarize", outputSchema: [] }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining("object"),
    });
  });

  it("accepts string clientContext on create-session requests", async () => {
    const app = eveCompat({ agentName: "assistant" });
    const response = await app.request(
      jsonRequest("/session", {
        clientContext: "selection: jazz",
        message: "What word is selected?",
      }),
    );
    expect(response.status).toBe(202);
  });

  it("accepts string-array clientContext on create-session requests", async () => {
    const app = eveCompat({ agentName: "assistant" });
    const response = await app.request(
      jsonRequest("/session", {
        clientContext: ["route: /editor", "selection: jazz"],
        message: "What word is selected?",
      }),
    );
    expect(response.status).toBe(202);
  });

  it("rejects invalid create-session clientContext", async () => {
    const app = eveCompat({ agentName: "assistant" });
    const response = await app.request(
      jsonRequest("/session", { clientContext: [42], message: "hi" }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining("clientContext"),
    });
  });

  it("forwards inputResponses without a message on continue requests", async () => {
    const app = eveCompat({ agentName: "assistant", admission: createMockAdmission() });

    const start = await app.request(jsonRequest("/session", { message: "Hello" }));
    const { sessionId, continuationToken } = (await start.json()) as {
      sessionId: string;
      continuationToken: string;
    };
    await new Promise((resolve) => setTimeout(resolve, 120));

    const response = await app.request(
      jsonRequest(`/session/${sessionId}`, {
        continuationToken,
        inputResponses: [{ requestId: "req-1", optionId: "deny" }],
      }),
    );

    expect(response.status).toBe(200);
  });

  it("forwards inputResponses alongside a continue message", async () => {
    const captured: Array<Record<string, unknown>> = [];
    const app = eveCompat({
      agentName: "assistant",
      admission: {
        async *admitTurn(input) {
          captured.push({
            message: input.message,
            inputResponses: input.inputResponses,
          });
          yield { type: "idle" };
        },
      },
    });

    const start = await app.request(jsonRequest("/session", { message: "Hello" }));
    const { sessionId, continuationToken } = (await start.json()) as {
      sessionId: string;
      continuationToken: string;
    };
    await new Promise((resolve) => setTimeout(resolve, 50));

    const response = await app.request(
      jsonRequest(`/session/${sessionId}`, {
        continuationToken,
        inputResponses: [{ requestId: "req-1", optionId: "approve" }],
        message: "yes please",
      }),
    );

    expect(response.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(captured.at(-1)).toMatchObject({
      message: "yes please",
      inputResponses: [{ requestId: "req-1", optionId: "approve" }],
    });
  });

  it("rejects stale continuation tokens with 409", async () => {
    const app = eveCompat({ agentName: "assistant" });

    const start = await app.request(jsonRequest("/session", { message: "Hello" }));
    const { sessionId } = (await start.json()) as { sessionId: string };
    await new Promise((resolve) => setTimeout(resolve, 120));

    const response = await app.request(
      jsonRequest(`/session/${sessionId}`, {
        continuationToken: "http:stale-token",
        message: "Again",
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ ok: false });
  });

  it("accepts string clientContext on continue-session requests", async () => {
    const captured: Array<Record<string, unknown>> = [];
    const app = eveCompat({
      agentName: "assistant",
      admission: {
        async *admitTurn(input) {
          captured.push({ clientContext: input.clientContext, message: input.message });
          yield { type: "idle" };
        },
      },
    });

    const start = await app.request(jsonRequest("/session", { message: "Hello" }));
    const { sessionId, continuationToken } = (await start.json()) as {
      sessionId: string;
      continuationToken: string;
    };
    await new Promise((resolve) => setTimeout(resolve, 50));

    const response = await app.request(
      jsonRequest(`/session/${sessionId}`, {
        clientContext: "approval modal open",
        continuationToken,
        message: "yes please",
      }),
    );

    expect(response.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(captured.at(-1)).toMatchObject({
      clientContext: "approval modal open",
      message: "yes please",
    });
  });

  it("forwards outputSchema with a continue-session message", async () => {
    const captured: Array<Record<string, unknown>> = [];
    const app = eveCompat({
      agentName: "assistant",
      admission: {
        async *admitTurn(input) {
          captured.push({ message: input.message, outputSchema: input.outputSchema });
          yield { type: "idle" };
        },
      },
    });

    const start = await app.request(jsonRequest("/session", { message: "Hello" }));
    const { sessionId, continuationToken } = (await start.json()) as {
      sessionId: string;
      continuationToken: string;
    };
    await new Promise((resolve) => setTimeout(resolve, 50));

    const outputSchema = {
      properties: { title: { type: "string" } },
      required: ["title"],
      type: "object",
    };

    const response = await app.request(
      jsonRequest(`/session/${sessionId}`, {
        continuationToken,
        message: "Summarize",
        outputSchema,
      }),
    );

    expect(response.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(captured.at(-1)).toMatchObject({ message: "Summarize", outputSchema });
  });

  it("rejects invalid continue-session clientContext", async () => {
    const app = eveCompat({ agentName: "assistant" });

    const start = await app.request(jsonRequest("/session", { message: "Hello" }));
    const { sessionId, continuationToken } = (await start.json()) as {
      sessionId: string;
      continuationToken: string;
    };
    await new Promise((resolve) => setTimeout(resolve, 120));

    const response = await app.request(
      jsonRequest(`/session/${sessionId}`, {
        clientContext: 123,
        continuationToken,
        message: "hi",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining("clientContext"),
    });
  });
});