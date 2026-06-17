import { describe, expect, it } from "vitest";

import {
  EVE_MESSAGE_STREAM_VERSION,
  EVE_STREAM_FORMAT_HEADER,
  EVE_STREAM_VERSION_HEADER,
} from "@flue-eve/shared";

import { createHitlMockAdmission } from "./admission/hitl-mock.js";
import { eveCompat } from "./eve-compat.js";

async function readNdjson(response: Response): Promise<unknown[]> {
  const text = await response.text();
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown);
}

describe("eveCompat", () => {
  it("serves health in Eve shape", async () => {
    const app = eveCompat({ agentName: "assistant" });
    const response = await app.request("/health");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      status: "ready",
      workflowId: expect.any(String),
    });
  });

  it("creates session with 202 and streams multi-turn events", async () => {
    const app = eveCompat({ agentName: "assistant" });

    const start = await app.request("/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Hello" }),
    });

    expect(start.status).toBe(202);
    const startBody = (await start.json()) as {
      sessionId: string;
      continuationToken: string;
    };

    await new Promise((r) => setTimeout(r, 150));

    const stream1 = await app.request(`/session/${startBody.sessionId}/stream`);
    expect(stream1.status).toBe(200);
    expect(stream1.headers.get(EVE_STREAM_VERSION_HEADER)).toBe(EVE_MESSAGE_STREAM_VERSION);
    expect(stream1.headers.get(EVE_STREAM_FORMAT_HEADER)).toBe("ndjson");

    const events1 = await readNdjson(stream1);
    expect(events1.some((e) => (e as { type: string }).type === "session.waiting")).toBe(true);

    const follow = await app.request(`/session/${startBody.sessionId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: "Follow up",
        continuationToken: startBody.continuationToken,
      }),
    });

    expect(follow.status).toBe(200);
    await new Promise((r) => setTimeout(r, 150));

    const stream2 = await app.request(
      `/session/${startBody.sessionId}/stream?startIndex=${events1.length}`,
    );
    const events2 = await readNdjson(stream2);
    const all = [...events1, ...events2];

    const waitingCount = all.filter((e) => (e as { type: string }).type === "session.waiting").length;
    expect(waitingCount).toBeGreaterThanOrEqual(2);
    expect(all.length).toBeGreaterThan(events1.length);
  });

  it("parks on input.requested and resumes with inputResponses-only follow-up", async () => {
    const app = eveCompat({
      agentName: "assistant",
      admission: createHitlMockAdmission(),
    });

    const start = await app.request("/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Please __hitl__" }),
    });
    expect(start.status).toBe(202);
    const { sessionId, continuationToken } = (await start.json()) as {
      sessionId: string;
      continuationToken: string;
    };

    await new Promise((r) => setTimeout(r, 150));

    const stream1 = await readNdjson(await app.request(`/session/${sessionId}/stream`));
    expect(stream1.some((e) => (e as { type: string }).type === "input.requested")).toBe(true);
    expect(stream1.some((e) => (e as { type: string }).type === "session.waiting")).toBe(true);

    const resume = await app.request(`/session/${sessionId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        continuationToken,
        inputResponses: [{ requestId: "approval_1", optionId: "approve" }],
      }),
    });
    expect(resume.status).toBe(200);

    await new Promise((r) => setTimeout(r, 150));

    const stream2 = await readNdjson(
      await app.request(`/session/${sessionId}/stream?startIndex=${stream1.length}`),
    );
    const resumed = [...stream1, ...stream2];
    expect(resumed.some((e) => (e as { type: string }).type === "action.result")).toBe(true);
    expect(resumed.filter((e) => (e as { type: string }).type === "session.waiting").length).toBe(
      2,
    );
  });

  it("rejects stale continuation token with 409", async () => {
    const app = eveCompat({ agentName: "assistant" });

    const start = await app.request("/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Hi" }),
    });
    const { sessionId } = (await start.json()) as { sessionId: string };

    await new Promise((r) => setTimeout(r, 80));

    const stale = await app.request(`/session/${sessionId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Again", continuationToken: "eve:stale" }),
    });

    expect(stale.status).toBe(409);
  });
});