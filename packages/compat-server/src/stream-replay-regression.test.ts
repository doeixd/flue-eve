// Regression: multi-turn journals must replay from startIndex=0 across all turns.
// Adapted from vercel/eve packages/eve/test/eve-run-stream-channel.test.ts commentary (Apache-2.0)
import { describe, expect, it } from "vitest";

import { eveCompat } from "./eve-compat.js";

async function readNdjson(response: Response): Promise<unknown[]> {
  const text = await response.text();
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown);
}

describe("multi-turn stream replay regression", () => {
  it("includes every turn when replaying from startIndex=0", async () => {
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

    for (const message of ["Turn two", "Turn three"]) {
      const follow = await app.request(`/session/${sessionId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, continuationToken }),
      });
      expect(follow.status).toBe(200);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }

    const replay = await readNdjson(await app.request(`/session/${sessionId}/stream?startIndex=0`));
    const received = replay.filter((event) => (event as { type: string }).type === "message.received");

    expect(received).toHaveLength(3);
    expect(
      received.map((event) => (event as { data: { message: string } }).data.message),
    ).toEqual(["Turn one", "Turn two", "Turn three"]);
  });

  it("replays only the latest turn when startIndex skips prior turns", async () => {
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
    const afterTurnOne = await readNdjson(await app.request(`/session/${sessionId}/stream`));
    const turnOneLength = afterTurnOne.length;

    await app.request(`/session/${sessionId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Turn two", continuationToken }),
    });
    await new Promise((resolve) => setTimeout(resolve, 120));

    const partial = await readNdjson(
      await app.request(`/session/${sessionId}/stream?startIndex=${turnOneLength}`),
    );
    const received = partial.filter((event) => (event as { type: string }).type === "message.received");

    expect(received).toHaveLength(1);
    expect((received[0] as { data: { message: string } }).data.message).toBe("Turn two");
  });
});