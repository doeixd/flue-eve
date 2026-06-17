// Adapted from vercel/eve packages/eve/test/eve-run-stream-channel.test.ts (Apache-2.0)
import { describe, expect, it } from "vitest";

import {
  EVE_MESSAGE_STREAM_VERSION,
  EVE_STREAM_FORMAT_HEADER,
  EVE_STREAM_VERSION_HEADER,
} from "@flue-eve/shared";

import { eveCompat } from "./eve-compat.js";

async function readNdjson(response: Response): Promise<unknown[]> {
  const text = await response.text();
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown);
}

describe("eveCompat GET /session/:sessionId/stream", () => {
  it("forwards startIndex and replays from the journal offset", async () => {
    const app = eveCompat({ agentName: "assistant" });

    const start = await app.request("/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Hello" }),
    });
    const { sessionId } = (await start.json()) as { sessionId: string };
    await new Promise((r) => setTimeout(r, 120));

    const full = await readNdjson(await app.request(`/session/${sessionId}/stream`));
    const partial = await readNdjson(
      await app.request(`/session/${sessionId}/stream?startIndex=2`),
    );

    expect(partial.length).toBe(full.length - 2);
    expect(partial[0]).toEqual(full[2]);
  });

  it("rejects malformed startIndex values with 400", async () => {
    const app = eveCompat({ agentName: "assistant" });
    const start = await app.request("/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Hello" }),
    });
    const { sessionId } = (await start.json()) as { sessionId: string };

    const negative = await app.request(`/session/${sessionId}/stream?startIndex=-3`);
    expect(negative.status).toBe(400);
    await expect(negative.json()).resolves.toMatchObject({ ok: false });

    const banana = await app.request(`/session/${sessionId}/stream?startIndex=banana`);
    expect(banana.status).toBe(400);
  });

  it("returns Eve stream headers on success", async () => {
    const app = eveCompat({ agentName: "assistant" });
    const start = await app.request("/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Hello" }),
    });
    const { sessionId } = (await start.json()) as { sessionId: string };
    await new Promise((r) => setTimeout(r, 120));

    const stream = await app.request(`/session/${sessionId}/stream`);
    expect(stream.status).toBe(200);
    expect(stream.headers.get(EVE_STREAM_VERSION_HEADER)).toBe(EVE_MESSAGE_STREAM_VERSION);
    expect(stream.headers.get(EVE_STREAM_FORMAT_HEADER)).toBe("ndjson");
  });

  it("returns 404 for unknown sessions", async () => {
    const app = eveCompat({ agentName: "assistant" });
    const response = await app.request("/session/ses_missing/stream");
    expect(response.status).toBe(404);
  });

  it("does not match stream routes with an empty sessionId path segment", async () => {
    const app = eveCompat({ agentName: "assistant" });
    const response = await app.request("/session//stream");
    expect(response.status).toBe(404);
  });

  it("rejects non-integer startIndex values with 400", async () => {
    const app = eveCompat({ agentName: "assistant" });
    const start = await app.request("/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Hello" }),
    });
    const { sessionId } = (await start.json()) as { sessionId: string };

    const float = await app.request(`/session/${sessionId}/stream?startIndex=1.5`);
    expect(float.status).toBe(400);
  });

  it("serializes journal events as NDJSON lines", async () => {
    const app = eveCompat({ agentName: "assistant" });
    const start = await app.request("/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Hello" }),
    });
    const { sessionId } = (await start.json()) as { sessionId: string };
    await new Promise((resolve) => setTimeout(resolve, 120));

    const response = await app.request(`/session/${sessionId}/stream`);
    const text = await response.text();
    const lines = text.trim().split("\n");

    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      const event = JSON.parse(line) as { type: string };
      expect(typeof event.type).toBe("string");
    }
    expect(lines.some((line) => JSON.parse(line).type === "session.waiting")).toBe(true);
  });

  it("returns an empty body when startIndex is beyond the journal", async () => {
    const app = eveCompat({ agentName: "assistant" });
    const start = await app.request("/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Hello" }),
    });
    const { sessionId } = (await start.json()) as { sessionId: string };
    await new Promise((resolve) => setTimeout(resolve, 120));

    const full = await readNdjson(await app.request(`/session/${sessionId}/stream`));
    const beyond = await readNdjson(
      await app.request(`/session/${sessionId}/stream?startIndex=${full.length + 50}`),
    );
    expect(beyond).toEqual([]);
  });
});