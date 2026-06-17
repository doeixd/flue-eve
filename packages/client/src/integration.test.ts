import { serve } from "@hono/node-server";
import { createEveCompatApp } from "@flue-eve/compat-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Client } from "./client.js";

describe("Client integration", () => {
  let baseUrl: string;
  let server: ReturnType<typeof serve>;

  beforeAll(async () => {
    const app = createEveCompatApp({ agentName: "assistant" });
    await new Promise<void>((resolve) => {
      server = serve({ fetch: app.fetch, port: 0 }, (info) => {
        baseUrl = `http://127.0.0.1:${info.port}`;
        resolve();
      });
    });
  });

  afterAll(() => {
    server.close();
  });

  it("completes a three-turn conversation", async () => {
    const client = new Client({ host: baseUrl });
    await expect(client.health()).resolves.toMatchObject({
      ok: true,
      status: "ready",
    });

    const session = client.session();

    for (const message of ["Turn one", "Turn two", "Turn three"]) {
      const response = await session.send(message);
      const result = await response.result();
      expect(result.status).toBe("waiting");
      expect(result.message).toContain(message);
      await new Promise((r) => setTimeout(r, 100));
    }

    expect(session.state.streamIndex).toBeGreaterThan(0);
  });

  it("returns structured output when outputSchema is provided", async () => {
    const client = new Client({ host: baseUrl });
    const session = client.session();
    const outputSchema = {
      type: "object",
      properties: { title: { type: "string" } },
      required: ["title"],
    };

    const response = await session.send<{ title: string }>({
      message: "Summarize",
      outputSchema,
    });
    const result = await response.result();

    expect((result.data as { title?: string } | undefined)?.title).toContain("Reply:");
    expect(result.status).toBe("waiting");
  });

  it("rejects stale continuation tokens with ClientError", async () => {
    const client = new Client({ host: baseUrl });
    const session = client.session();

    const first = await session.send("Hello");
    await first.result();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const response = await fetch(`${baseUrl}/eve/v1/session/${session.state.sessionId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: "Stale",
        continuationToken: "eve:definitely-stale",
      }),
    });

    expect(response.status).toBe(409);
  });

  it("accepts string clientContext on create and continue requests", async () => {
    const client = new Client({ host: baseUrl });
    const session = client.session();

    const first = await session.send({
      message: "Context one",
      clientContext: "route: /home",
    });
    await first.result();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const second = await session.send({
      message: "Context two",
      clientContext: ["tab: chat", "modal: closed"],
    });
    const result = await second.result();
    expect(result.status).toBe("waiting");
  });

  it("reconnects stream from a saved streamIndex after turn completes", async () => {
    const client = new Client({ host: baseUrl });
    const session = client.session();

    const response = await session.send("Reconnect me");
    const result = await response.result();
    expect(result.status).toBe("waiting");
    expect(session.state.sessionId).toBeTruthy();

    const resumeIndex = Math.max(0, session.state.streamIndex - 2);
    const reconnected = session.stream({ startIndex: resumeIndex });
    const replayed: string[] = [];
    for await (const event of reconnected) {
      replayed.push(event.type);
    }

    expect(replayed.length).toBeGreaterThan(0);
    expect(replayed).toContain("session.waiting");
  });
});