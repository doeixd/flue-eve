import type { EveEvent } from "@flue-eve/shared";
import {
  EVE_MESSAGE_STREAM_CONTENT_TYPE,
  EVE_MESSAGE_STREAM_FORMAT,
  EVE_MESSAGE_STREAM_VERSION,
  EVE_SESSION_ID_HEADER,
  EVE_STREAM_FORMAT_HEADER,
  EVE_STREAM_VERSION_HEADER,
} from "@flue-eve/shared";

import type { EveSessionRecord } from "./session-store.js";

export function streamHeaders(sessionId: string): Record<string, string> {
  return {
    "cache-control": "no-store, no-transform",
    "content-type": EVE_MESSAGE_STREAM_CONTENT_TYPE,
    "x-accel-buffering": "no",
    [EVE_SESSION_ID_HEADER]: sessionId,
    [EVE_STREAM_FORMAT_HEADER]: EVE_MESSAGE_STREAM_FORMAT,
    [EVE_STREAM_VERSION_HEADER]: EVE_MESSAGE_STREAM_VERSION,
  };
}

export function encodeNdjsonLine(event: EveEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

export function createNdjsonStream(
  session: EveSessionRecord,
  startIndex: number | undefined,
): ReadableStream<Uint8Array> {
  const fromIndex = startIndex ?? 0;

  if (fromIndex < session.journal.baseIndex) {
    throw new StartIndexTruncatedError(session.journal.baseIndex);
  }

  let poll: ReturnType<typeof setInterval> | undefined;
  let unsubscribe: (() => void) | undefined;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const snapshot = session.journal.snapshot(fromIndex);
      for (const event of snapshot.events) {
        controller.enqueue(encodeNdjsonLine(event));
      }

      if (session.status !== "active" || session.pendingAuthorization !== undefined) {
        controller.close();
        return;
      }

      unsubscribe = session.journal.subscribe((event, index) => {
        if (index >= fromIndex) {
          try {
            controller.enqueue(encodeNdjsonLine(event));
          } catch {
            unsubscribe?.();
          }
        }
      });

      poll = setInterval(() => {
        if (session.status !== "active" || session.pendingAuthorization !== undefined) {
          clearInterval(poll!);
          unsubscribe?.();
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      }, 100);
    },
    cancel() {
      if (poll !== undefined) clearInterval(poll);
      unsubscribe?.();
    },
  });
}

export class StartIndexTruncatedError extends Error {
  readonly baseIndex: number;

  constructor(baseIndex: number) {
    super(`startIndex refers to truncated journal; minimum is ${baseIndex}.`);
    this.name = "StartIndexTruncatedError";
    this.baseIndex = baseIndex;
  }
}