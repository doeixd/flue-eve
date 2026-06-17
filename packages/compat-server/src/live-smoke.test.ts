import { describe, expect, it } from "vitest";

const liveEnabled = process.env.EVE_LIVE_SMOKE === "1";
const host = process.env.EVE_LIVE_HOST ?? process.env.EVE_HOST ?? "http://127.0.0.1:3583";
const bearer = process.env.EVE_BEARER ?? process.env.EVE_AUTH_BEARER;

async function probeHealth(): Promise<boolean> {
  try {
    const headers: Record<string, string> = {};
    if (bearer !== undefined && bearer.length > 0) {
      headers.authorization = `Bearer ${bearer}`;
    }
    const response = await fetch(`${host}/eve/v1/health`, {
      headers,
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { ok?: boolean };
    return body.ok === true;
  } catch {
    return false;
  }
}

describe.runIf(liveEnabled)("live Eve smoke", () => {
  it("completes health, session, stream replay, and follow-up against a running compat server", async () => {
    const healthy = await probeHealth();
    expect(healthy, `Eve health probe failed for ${host}`).toBe(true);

    const authHeaders: Record<string, string> = { "content-type": "application/json" };
    if (bearer !== undefined && bearer.length > 0) {
      authHeaders.authorization = `Bearer ${bearer}`;
    }

    const start = await fetch(`${host}/eve/v1/session`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ message: "Live smoke turn one" }),
      signal: AbortSignal.timeout(10_000),
    });
    expect(start.status).toBe(202);
    const { sessionId, continuationToken } = (await start.json()) as {
      sessionId: string;
      continuationToken: string;
    };

    await new Promise((resolve) => setTimeout(resolve, 500));

    const stream = await fetch(`${host}/eve/v1/session/${sessionId}/stream`, {
      headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
      signal: AbortSignal.timeout(15_000),
    });
    expect(stream.status).toBe(200);
    const text = await stream.text();
    const types = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => (JSON.parse(line) as { type: string }).type);
    expect(types).toContain("session.waiting");

    const follow = await fetch(`${host}/eve/v1/session/${sessionId}`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ message: "Live smoke turn two", continuationToken }),
      signal: AbortSignal.timeout(10_000),
    });
    expect(follow.status).toBe(200);
  }, 30_000);
});