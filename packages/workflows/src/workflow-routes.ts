import { Hono } from "hono";
import type { EveEvent } from "@flue-eve/shared";
import {
  EVE_STREAM_FORMAT_HEADER,
  EVE_STREAM_VERSION_HEADER,
  EVE_MESSAGE_STREAM_CONTENT_TYPE,
  EVE_MESSAGE_STREAM_FORMAT,
  EVE_MESSAGE_STREAM_VERSION,
  COMPAT_API_VERSION,
} from "@flue-eve/shared";
import type { EveWorkflowOptions } from "./types.js";

function streamHeaders(runId: string): Record<string, string> {
  return {
    "content-type": EVE_MESSAGE_STREAM_CONTENT_TYPE,
    "x-eve-run-id": runId,
    [EVE_STREAM_FORMAT_HEADER]: EVE_MESSAGE_STREAM_FORMAT,
    [EVE_STREAM_VERSION_HEADER]: EVE_MESSAGE_STREAM_VERSION,
    "cache-control": "no-store, no-transform",
    "x-accel-buffering": "no",
    "x-flue-eve-compat": COMPAT_API_VERSION,
  };
}

export function createEveWorkflowApp(options: EveWorkflowOptions): Hono {
  const basePath = options.basePath ?? "/eve/v1/runs";
  const app = new Hono();

  app.post(`${basePath}`, async (c) => {
    const raw = await c.req.json().catch(() => ({}));
    const workflowName = typeof raw.workflow === "string" ? raw.workflow : "default";
    const payload = raw.payload ?? {};

    try {
      const { runId } = await options.submitRun(workflowName, payload);
      return c.json({ ok: true, runId, workflow: workflowName }, 202, {
        "cache-control": "no-store",
        "x-eve-run-id": runId,
        "x-flue-eve-compat": COMPAT_API_VERSION,
      });
    } catch {
      return c.json({ ok: false, error: "Workflow submission failed" }, 500);
    }
  });

  app.get(`${basePath}/:runId/stream`, async (c) => {
    const runId = c.req.param("runId");
    if (!runId) {
      return c.json({ ok: false, error: "runId is required." }, 400);
    }

    const startIndexParam = c.req.query("startIndex");
    const startIndex = startIndexParam ? parseInt(startIndexParam, 10) : undefined;
    if (startIndex !== undefined && (!Number.isFinite(startIndex) || startIndex < 0)) {
      return c.json({ ok: false, error: "startIndex must be a non-negative integer." }, 400);
    }

    const events = options.readStream(runId, { startIndex });

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
            data: {
              code: "stream_read_error",
              message: "Stream read failed",
              sessionId: runId,
            },
          };
          controller.enqueue(encoder.encode(JSON.stringify(errorEvent) + "\n"));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, { headers: streamHeaders(runId) });
  });

  return app;
}
