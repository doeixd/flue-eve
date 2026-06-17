import { Hono } from "hono";
import type { EveEvent } from "@flue-eve/shared";
import {
  EVE_SESSION_ID_HEADER,
  EVE_STREAM_FORMAT_HEADER,
  EVE_STREAM_VERSION_HEADER,
  EVE_MESSAGE_STREAM_CONTENT_TYPE,
  EVE_MESSAGE_STREAM_FORMAT,
  EVE_MESSAGE_STREAM_VERSION,
  COMPAT_API_VERSION,
} from "@flue-eve/shared";
import type { EveChannelOptions } from "./types.js";

function streamHeaders(sessionId: string): Record<string, string> {
  return {
    "content-type": EVE_MESSAGE_STREAM_CONTENT_TYPE,
    [EVE_SESSION_ID_HEADER]: sessionId,
    [EVE_STREAM_FORMAT_HEADER]: EVE_MESSAGE_STREAM_FORMAT,
    [EVE_STREAM_VERSION_HEADER]: EVE_MESSAGE_STREAM_VERSION,
    "cache-control": "no-store, no-transform",
    "x-accel-buffering": "no",
    "x-flue-eve-compat": COMPAT_API_VERSION,
  };
}

export function createEveChannelBridge(options: EveChannelOptions): Hono {
  const basePath = options.basePath ?? "/eve/v1/channels";
  const app = new Hono();

  app.post(`${basePath}/:channelName/events`, async (c) => {
    const channelName = c.req.param("channelName");
    if (!channelName) {
      return c.json({ ok: false, error: "channelName is required." }, 400);
    }

    const raw = await c.req.json().catch(() => ({})) as Record<string, unknown>;

    const message = typeof raw.message === "string" ? raw.message : "";
    if (!message) {
      return c.json({ ok: false, error: "message is required." }, 400);
    }

    try {
      const result = await options.dispatch({
        channelName,
        sessionId: typeof raw.sessionId === "string" ? raw.sessionId : undefined,
        message,
        metadata: typeof raw.metadata === "object" && raw.metadata !== null
          ? raw.metadata as Record<string, unknown>
          : undefined,
      });

      return c.json(
        { ok: true, sessionId: result.sessionId, continuationToken: result.continuationToken },
        200,
        {
          "cache-control": "no-store",
          [EVE_SESSION_ID_HEADER]: result.sessionId,
          "x-flue-eve-compat": COMPAT_API_VERSION,
        },
      );
    } catch {
      return c.json({ ok: false, error: "Channel dispatch failed" }, 500);
    }
  });

  app.get(`${basePath}/:channelName/session/:sessionId/stream`, async (c) => {
    const sessionId = c.req.param("sessionId");
    if (!sessionId) {
      return c.json({ ok: false, error: "sessionId is required." }, 400);
    }

    const startIndexParam = c.req.query("startIndex");
    const startIndex = startIndexParam ? Number(startIndexParam) : undefined;
    if (startIndex !== undefined && (!Number.isFinite(startIndex) || startIndex < 0 || !Number.isInteger(startIndex))) {
      return c.json({ ok: false, error: "startIndex must be a non-negative integer." }, 400);
    }

    const events = options.readStream(sessionId, { startIndex });

    const encoder = new TextEncoder();
    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of events) {
            controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
          }
        } catch {
          const errorEvent: EveEvent = {
            type: "session.failed",
            data: { code: "stream_read_error", message: "Stream read failed", sessionId },
          };
          controller.enqueue(encoder.encode(JSON.stringify(errorEvent) + "\n"));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, { headers: streamHeaders(sessionId) });
  });

  return app;
}
