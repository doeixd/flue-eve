import { describe, expect, it, vi } from "vitest";
import type { EveEvent } from "@flue-eve/shared";
import { createEveChannelBridge } from "./channel-routes.js";

describe("createEveChannelBridge", () => {
  it("POST /eve/v1/channels/:channelName/events dispatches and returns session info", async () => {
    const dispatch = vi.fn(async () => ({
      sessionId: "ses_123",
      continuationToken: "tok_abc",
    }));
    const readStream = vi.fn();

    const app = createEveChannelBridge({ dispatch, readStream });
    const res = await app.request("/eve/v1/channels/slack/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Hello from Slack" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.sessionId).toBe("ses_123");
    expect(body.continuationToken).toBe("tok_abc");
    expect(dispatch).toHaveBeenCalledWith({
      channelName: "slack",
      message: "Hello from Slack",
    });
  });

  it("POST returns 400 when message is missing", async () => {
    const dispatch = vi.fn();
    const readStream = vi.fn();

    const app = createEveChannelBridge({ dispatch, readStream });
    const res = await app.request("/eve/v1/channels/discord/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toContain("message");
  });

  it("POST forwards sessionId when provided and returns 500 on dispatch failure", async () => {
    const dispatch = vi.fn(async () => {
      throw new Error("Dispatch failed");
    });
    const readStream = vi.fn();

    const app = createEveChannelBridge({ dispatch, readStream });
    const res = await app.request("/eve/v1/channels/telegram/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: "Hello",
        sessionId: "ses_456",
        metadata: { chatId: "789" },
      }),
    });

    expect(res.status).toBe(500);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toContain("Dispatch failed");
    expect(dispatch).toHaveBeenCalledWith({
      channelName: "telegram",
      sessionId: "ses_456",
      message: "Hello",
      metadata: { chatId: "789" },
    });
  });

  it("GET stream returns NDJSON events", async () => {
    const dispatch = vi.fn();
    const readStream = vi.fn(async function* (): AsyncGenerator<EveEvent> {
      yield { type: "session.started", data: { sessionId: "ses_789" } };
      yield { type: "message.received", data: { role: "user", content: "hi" } };
    });

    const app = createEveChannelBridge({ dispatch, readStream });
    const res = await app.request("/eve/v1/channels/web/session/ses_789/stream");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("x-ndjson");

    const text = await res.text();
    const lines = text.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).type).toBe("session.started");
  });

  it("GET stream respects startIndex query param", async () => {
    const dispatch = vi.fn();
    const readStream = vi.fn(async function* (): AsyncGenerator<EveEvent> {
      yield { type: "session.waiting", data: {} };
    });

    const app = createEveChannelBridge({ dispatch, readStream });
    await app.request("/eve/v1/channels/web/session/ses_789/stream?startIndex=3");

    expect(readStream).toHaveBeenCalledWith("ses_789", { startIndex: 3 });
  });
});
