import {
  EVE_CREATE_SESSION_ROUTE_PATH,
  EVE_SESSION_ID_HEADER,
  createEveContinueSessionRoutePath,
  isCurrentTurnBoundaryEvent,
} from "@flue-eve/shared";

import { ClientError } from "./client-error.js";
import { MessageResponse } from "./message-response.js";
import { isStreamDisconnectError, readNdjsonStream } from "./ndjson.js";
import { openStreamBody, openStreamIterable } from "./open-stream.js";
import { advanceSession } from "./session-utils.js";
import { createClientUrl } from "./url.js";
import type {
  HandleMessageStreamEvent,
  SendTurnInput,
  SendTurnPayload,
  SessionState,
  StreamOptions,
} from "./types.js";

const DELIVER_RETRY_ATTEMPTS = 10;
const DELIVER_RETRY_DELAY_MS = 200;

interface SessionContext {
  readonly host: string;
  readonly maxReconnectAttempts: number;
  readonly preserveCompletedSessions: boolean;
  resolveHeaders(perRequest?: Readonly<Record<string, string>>): Promise<Headers>;
}

export class ClientSession {
  readonly #context: SessionContext;
  #state: SessionState;

  constructor(context: SessionContext, state: SessionState) {
    this.#context = context;
    this.#state = state;
  }

  get state(): SessionState {
    return this.#state;
  }

  async send<TOutput = unknown>(input: SendTurnInput<TOutput>): Promise<MessageResponse<TOutput>> {
    const payload = normalizeSendTurnInput(input);
    const state = this.#state;
    const postResult = await this.#postTurn(payload, state);
    const { continuationToken, sessionId } = postResult;

    return new MessageResponse<TOutput>({
      continuationToken,
      createStream: () => this.#createEventStream(sessionId, continuationToken, state, payload),
      sessionId,
    });
  }

  stream(options?: StreamOptions): AsyncIterable<HandleMessageStreamEvent> {
    const sessionId = this.#state.sessionId;
    if (!sessionId) throw new Error("Session has no session ID. Send a message first.");
    return this.#streamAndAdvance(sessionId, options);
  }

  async #postTurn(
    input: SendTurnPayload,
    session: SessionState,
  ): Promise<{ continuationToken?: string; sessionId: string }> {
    const routePath = session.sessionId
      ? createEveContinueSessionRoutePath(session.sessionId)
      : EVE_CREATE_SESSION_ROUTE_PATH;
    const url = createClientUrl(this.#context.host, routePath);
    const headers = await this.#context.resolveHeaders(input.headers);
    headers.set("content-type", "application/json");

    const body = createHandleMessageBody({ input, session });
    if (body === null) {
      throw new Error("Session.send requires a non-empty message, inputResponses, or both.");
    }

    const response = await postTurnWithRetry({
      body: JSON.stringify(body),
      headers,
      mustDeliver: (input.inputResponses?.length ?? 0) > 0,
      signal: input.signal,
      url,
    });

    const payload = (await response.json()) as Record<string, unknown>;
    const sessionId =
      (typeof payload.sessionId === "string" ? payload.sessionId : undefined) ??
      response.headers.get(EVE_SESSION_ID_HEADER)?.trim() ??
      session.sessionId;

    if (!sessionId) throw new Error("Message route did not return a session id.");

    const continuationToken =
      typeof payload.continuationToken === "string" ? payload.continuationToken : undefined;

    return { continuationToken, sessionId };
  }

  async *#createEventStream(
    sessionId: string,
    continuationToken: string | undefined,
    initialState: SessionState,
    input: SendTurnPayload,
  ): AsyncGenerator<HandleMessageStreamEvent> {
    const events: HandleMessageStreamEvent[] = [];
    let streamError: unknown;

    try {
      let currentStreamIndex = initialState.sessionId === sessionId ? initialState.streamIndex : 0;
      let remainingReconnectAttempts = this.#context.maxReconnectAttempts;

      while (true) {
        const body = await this.#openStreamBody(
          sessionId,
          currentStreamIndex,
          input.signal,
          input.headers,
        );

        let foundBoundary = false;

        try {
          for await (const event of readNdjsonStream(body)) {
            events.push(event);
            currentStreamIndex += 1;
            yield event;
            if (isCurrentTurnBoundaryEvent(event)) {
              foundBoundary = true;
              break;
            }
          }
        } catch (error) {
          if (!isStreamDisconnectError(error)) {
            streamError = error;
            throw error;
          }
        }

        if (foundBoundary || input.signal?.aborted || remainingReconnectAttempts <= 0) break;
        remainingReconnectAttempts -= 1;
      }
    } finally {
      if (!streamError) {
        this.#state = advanceSession({
          continuationToken,
          events,
          preserveCompletedSessions: this.#context.preserveCompletedSessions,
          sessionId,
          session: initialState,
        });
      }
    }
  }

  async #openStreamBody(
    sessionId: string,
    startIndex: number,
    signal?: AbortSignal,
    headers?: Readonly<Record<string, string>>,
  ): Promise<ReadableStream<Uint8Array>> {
    return openStreamBody({
      host: this.#context.host,
      resolveHeaders: () => this.#context.resolveHeaders(headers),
      sessionId,
      signal,
      startIndex,
    });
  }

  async *#streamAndAdvance(
    sessionId: string,
    options?: StreamOptions,
  ): AsyncGenerator<HandleMessageStreamEvent> {
    const initialState = this.#state;
    const streamIndex = options?.startIndex ?? initialState.streamIndex;
    const events: HandleMessageStreamEvent[] = [];
    let streamError: unknown;

    try {
      for await (const event of openStreamIterable({
        host: this.#context.host,
        maxReconnectAttempts: this.#context.maxReconnectAttempts,
        resolveHeaders: () => this.#context.resolveHeaders(),
        sessionId,
        signal: options?.signal,
        startIndex: streamIndex,
      })) {
        events.push(event);
        yield event;
      }
    } catch (error) {
      streamError = error;
      throw error;
    } finally {
      if (!streamError) {
        this.#state = advanceSession({
          continuationToken: initialState.continuationToken,
          events,
          preserveCompletedSessions: this.#context.preserveCompletedSessions,
          session: { ...initialState, sessionId, streamIndex },
          sessionId,
        });
      }
    }
  }
}

async function postTurnWithRetry(input: {
  readonly body: string;
  readonly headers: Headers;
  readonly mustDeliver: boolean;
  readonly signal?: AbortSignal;
  readonly url: string;
}): Promise<Response> {
  const attempts = input.mustDeliver ? DELIVER_RETRY_ATTEMPTS : 1;
  let lastStatus: number | undefined;
  let lastBody: string | undefined;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetch(input.url, {
      body: input.body,
      headers: input.headers,
      method: "POST",
      signal: input.signal ?? null,
    });

    if (response.ok) return response;
    lastStatus = response.status;
    lastBody = await response.text();
    if (!isRetryableDeliveryFailure(response.status, lastBody)) {
      throw new ClientError(response.status, lastBody);
    }
    if (attempt < attempts - 1) await sleep(DELIVER_RETRY_DELAY_MS);
  }

  throw new ClientError(lastStatus ?? 0, lastBody ?? "Failed to deliver session turn.");
}

function isRetryableDeliveryFailure(status: number, body: string): boolean {
  return status === 500 && /target session was not found/i.test(body);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeSendTurnInput(input: SendTurnInput): SendTurnPayload {
  return typeof input === "string" ? { message: input } : input;
}

function createHandleMessageBody(input: {
  readonly input: SendTurnPayload;
  readonly session: SessionState;
}): Record<string, unknown> | null {
  const body: Record<string, unknown> = {};

  if (input.input.message !== undefined) body.message = input.input.message;
  if (input.input.agent !== undefined) body.agent = input.input.agent;
  if (input.input.inputResponses !== undefined && input.input.inputResponses.length > 0) {
    body.inputResponses = input.input.inputResponses;
  }
  if (input.input.clientContext !== undefined) body.clientContext = input.input.clientContext;
  if (input.input.outputSchema !== undefined) body.outputSchema = input.input.outputSchema;
  if (input.session.continuationToken !== undefined) {
    body.continuationToken = input.session.continuationToken;
  }

  if (Object.keys(body).length === 0) return null;
  if (input.session.continuationToken === undefined && body.message === undefined) return null;
  if (
    input.session.continuationToken !== undefined &&
    body.message === undefined &&
    body.inputResponses === undefined
  ) {
    return null;
  }

  return body;
}