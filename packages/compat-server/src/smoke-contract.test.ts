import { describe, expect, it } from "vitest";

import { createEveCompatApp } from "./eve-compat.js";

async function readNdjson(response: Response): Promise<unknown[]> {
  const text = await response.text();
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown);
}

describe("Eve contract smoke (in-process)", () => {
  it("runs health, multi-turn chat, replay, and outputSchema", async () => {
    const app = createEveCompatApp({ agentName: "assistant" });

    const health = await app.request("/eve/v1/health");
    expect(health.status).toBe(200);
    const healthBody = (await health.json()) as { ok: boolean; status: string };
    expect(healthBody).toMatchObject({ ok: true, status: "ready" });

    const info = await app.request("/eve/v1/info");
    expect(info.status).toBe(200);
    const infoBody = (await info.json()) as { agent: { name: string } };
    expect(infoBody.agent.name).toBe("assistant");

    const start = await app.request("/eve/v1/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Smoke turn one." }),
    });
    expect(start.status).toBe(202);
    const { sessionId, continuationToken } = (await start.json()) as {
      sessionId: string;
      continuationToken: string;
    };

    await new Promise((resolve) => setTimeout(resolve, 120));

    const stream1 = await readNdjson(await app.request(`/eve/v1/session/${sessionId}/stream`));
    expect(stream1.some((event) => (event as { type: string }).type === "session.waiting")).toBe(
      true,
    );
    expect(stream1.some((event) => (event as { type: string }).type === "message.received")).toBe(
      true,
    );

    const follow = await app.request(`/eve/v1/session/${sessionId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Smoke turn two.", continuationToken }),
    });
    expect(follow.status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 120));

    const stream2 = await readNdjson(
      await app.request(`/eve/v1/session/${sessionId}/stream?startIndex=0`),
    );
    expect(stream2.filter((event) => (event as { type: string }).type === "turn.started").length).toBe(
      2,
    );

    const structured = await app.request("/eve/v1/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: "Structured smoke",
        outputSchema: {
          type: "object",
          properties: { title: { type: "string" } },
          required: ["title"],
        },
      }),
    });
    expect(structured.status).toBe(202);
    const structuredSession = (await structured.json()) as { sessionId: string };

    await new Promise((resolve) => setTimeout(resolve, 120));

    const structuredEvents = await readNdjson(
      await app.request(`/eve/v1/session/${structuredSession.sessionId}/stream`),
    );
    expect(
      structuredEvents.some((event) => (event as { type: string }).type === "result.completed"),
    ).toBe(true);
  });
});