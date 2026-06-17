// Shared helpers adapted from vercel/eve packages/eve/test/client.test.ts (Apache-2.0)
import {
  createMessageCompletedEvent,
  createMessageReceivedEvent,
  createSessionWaitingEvent,
  createTurnCompletedEvent,
  createTurnStartedEvent,
  EVE_SESSION_ID_HEADER,
} from "@flue-eve/shared";

import type { HandleMessageStreamEvent } from "./types.js";

export function createControlledStreamResponse(): {
  close(): void;
  error(error: Error): void;
  pushEvent(event: unknown): void;
  response: Response;
} {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;

  return {
    close() {
      controller?.close();
    },
    error(error) {
      controller?.error(error);
    },
    pushEvent(event) {
      controller?.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
    },
    response: new Response(
      new ReadableStream<Uint8Array>({
        start(streamController) {
          controller = streamController;
        },
      }),
    ),
  };
}

export function createStartedMessageResponse(
  sessionId: string,
  continuationToken: string,
): Response {
  return new Response(JSON.stringify({ continuationToken, ok: true, sessionId }), {
    headers: {
      "content-type": "application/json",
      [EVE_SESSION_ID_HEADER]: sessionId,
    },
    status: 202,
  });
}

export function createResumedMessageResponse(continuationToken: string): Response {
  return new Response(JSON.stringify({ continuationToken, ok: true }), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

export function createEagerStreamResponse(events: readonly unknown[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(streamController) {
        for (const event of events) {
          streamController.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
        streamController.close();
      },
    }),
  );
}

export function singleTurnEvents(input: {
  message: string;
  sequence: number;
  turnId: string;
}): HandleMessageStreamEvent[] {
  return [
    createTurnStartedEvent({ sequence: input.sequence, turnId: input.turnId }),
    createMessageReceivedEvent({
      message: input.message,
      sequence: input.sequence,
      turnId: input.turnId,
    }),
    createMessageCompletedEvent({
      message: `Reply: ${input.message}`,
      sequence: input.sequence,
      stepIndex: 0,
      turnId: input.turnId,
    }),
    createTurnCompletedEvent({ sequence: input.sequence, turnId: input.turnId }),
    createSessionWaitingEvent(),
  ];
}