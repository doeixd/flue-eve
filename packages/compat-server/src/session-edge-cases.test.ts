import type { FlueEvent } from "@flue-eve/shared";
import { describe, expect, it } from "vitest";

import { createHitlMockAdmission } from "./admission/hitl-mock.js";
import { eveCompat } from "./eve-compat.js";
import type { AdmitTurnInput, FlueAdmissionAdapter } from "./types.js";

async function readNdjson(response: Response): Promise<unknown[]> {
  const text = await response.text();
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown);
}

function createGatedAdmission(): FlueAdmissionAdapter & { release(): void } {
  let releaseGate: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    releaseGate = resolve;
  });

  return {
    async *admitTurn(_input: AdmitTurnInput): AsyncIterable<FlueEvent> {
      yield { type: "text_delta", text: "Working..." };
      await gate;
      yield { type: "idle" };
    },
    release() {
      releaseGate?.();
    },
  };
}

function createFailingAdmission(): FlueAdmissionAdapter {
  return {
    async *admitTurn(): AsyncIterable<FlueEvent> {
      yield { type: "error", code: "agent_error", message: "Simulated failure" };
    },
  };
}

describe("eveCompat session edge cases", () => {
  it("returns 409 when follow-up arrives while the turn is still active", async () => {
    const admission = createGatedAdmission();
    const app = eveCompat({ agentName: "assistant", admission });

    const start = await app.request("/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Hold" }),
    });
    expect(start.status).toBe(202);
    const { sessionId, continuationToken } = (await start.json()) as {
      sessionId: string;
      continuationToken: string;
    };

    await new Promise((resolve) => setTimeout(resolve, 30));

    const tooSoon = await app.request(`/session/${sessionId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: "Interrupt",
        continuationToken,
      }),
    });
    expect(tooSoon.status).toBe(409);
    await expect(tooSoon.json()).resolves.toMatchObject({
      ok: false,
      error: "Session is still active.",
    });

    admission.release();
    await new Promise((resolve) => setTimeout(resolve, 120));

    const resume = await app.request(`/session/${sessionId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: "After release",
        continuationToken,
      }),
    });
    expect(resume.status).toBe(200);
  });

  it("returns 410 when follow-up targets a failed session", async () => {
    const app = eveCompat({ agentName: "assistant", admission: createFailingAdmission() });

    const start = await app.request("/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Fail me" }),
    });
    const { sessionId, continuationToken } = (await start.json()) as {
      sessionId: string;
      continuationToken: string;
    };

    await new Promise((resolve) => setTimeout(resolve, 120));

    const stream = await readNdjson(await app.request(`/session/${sessionId}/stream`));
    expect(stream.some((event) => (event as { type: string }).type === "session.failed")).toBe(
      true,
    );

    const followUp = await app.request(`/session/${sessionId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: "Too late",
        continuationToken,
      }),
    });
    expect(followUp.status).toBe(410);
    await expect(followUp.json()).resolves.toMatchObject({
      ok: false,
      error: "Session is terminal.",
    });
  });

  it("returns 404 for unknown session on follow-up POST", async () => {
    const app = eveCompat({ agentName: "assistant" });

    const response = await app.request("/session/ses_missing", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Hello", continuationToken: "eve:token" }),
    });

    expect(response.status).toBe(404);
  });

  it("returns 409 when continuation token is missing on follow-up", async () => {
    const app = eveCompat({ agentName: "assistant" });

    const start = await app.request("/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Hello" }),
    });
    const { sessionId } = (await start.json()) as { sessionId: string };
    await new Promise((resolve) => setTimeout(resolve, 120));

    const missingToken = await app.request(`/session/${sessionId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Again" }),
    });

    expect(missingToken.status).toBe(409);
    await expect(missingToken.json()).resolves.toMatchObject({
      ok: false,
      error: "Stale or missing continuation token.",
    });
  });

  it("rejects invalid POST bodies on session start", async () => {
    const app = eveCompat({ agentName: "assistant" });

    const empty = await app.request("/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(empty.status).toBe(400);

    const malformed = await app.request("/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    });
    expect(malformed.status).toBe(400);
  });

  it("accepts combinatorial bodies with outputSchema, clientContext, and inputResponses", async () => {
    const app = eveCompat({
      agentName: "assistant",
      admission: createHitlMockAdmission(),
    });

    const outputSchema = {
      type: "object",
      properties: { summary: { type: "string" } },
    };
    const clientContext = { locale: "en-US", channel: "web" };

    const start = await app.request("/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: "Please __hitl__",
        outputSchema,
        clientContext,
      }),
    });
    expect(start.status).toBe(202);
    const { sessionId, continuationToken } = (await start.json()) as {
      sessionId: string;
      continuationToken: string;
    };

    await new Promise((resolve) => setTimeout(resolve, 150));

    const stream1 = await readNdjson(await app.request(`/session/${sessionId}/stream`));
    expect(stream1.some((event) => (event as { type: string }).type === "input.requested")).toBe(
      true,
    );

    const resume = await app.request(`/session/${sessionId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        continuationToken,
        message: "Approved path",
        inputResponses: [{ requestId: "approval_1", optionId: "approve" }],
        outputSchema,
        clientContext: { locale: "en-US", resumed: true },
      }),
    });
    expect(resume.status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 150));

    const stream2 = await readNdjson(
      await app.request(`/session/${sessionId}/stream?startIndex=${stream1.length}`),
    );
    const all = [...stream1, ...stream2];
    expect(all.some((event) => (event as { type: string }).type === "action.result")).toBe(true);
    expect(all.filter((event) => (event as { type: string }).type === "session.waiting").length).toBe(
      2,
    );
  });

  it("returns 409 for OAuth callback without pending authorization", async () => {
    const app = eveCompat({ agentName: "assistant" });

    const start = await app.request("/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Hello" }),
    });
    const { sessionId } = (await start.json()) as { sessionId: string };
    await new Promise((resolve) => setTimeout(resolve, 120));

    const wrongConnection = await app.request(
      `/connections/linear/callback?sessionId=${encodeURIComponent(sessionId)}`,
    );
    expect(wrongConnection.status).toBe(409);

    const missingSession = await app.request("/connections/linear/callback?sessionId=ses_nope");
    expect(missingSession.status).toBe(404);

    const missingQuery = await app.request("/connections/linear/callback");
    expect(missingQuery.status).toBe(400);
  });

  it("keeps the continuation token stable across multiple turns", async () => {
    const app = eveCompat({ agentName: "assistant" });

    const start = await app.request("/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Turn one" }),
    });
    const { sessionId, continuationToken } = (await start.json()) as {
      sessionId: string;
      continuationToken: string;
    };

    await new Promise((resolve) => setTimeout(resolve, 120));

    const turnTwo = await app.request(`/session/${sessionId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Turn two", continuationToken }),
    });
    expect(turnTwo.status).toBe(200);
    expect((await turnTwo.json()).continuationToken).toBeUndefined();

    await new Promise((resolve) => setTimeout(resolve, 120));

    const turnThree = await app.request(`/session/${sessionId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Turn three", continuationToken }),
    });
    expect(turnThree.status).toBe(200);
  });

  it("includes Eve session headers on POST /session", async () => {
    const app = eveCompat({ agentName: "assistant" });

    const start = await app.request("/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Hello" }),
    });

    expect(start.status).toBe(202);
    expect(start.headers.get("x-eve-session-id")).toMatch(/^ses_/);
    expect(start.headers.get("x-flue-eve-compat")).toBeTruthy();
  });
});