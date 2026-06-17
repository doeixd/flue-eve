import {
  Client,
  ClientSession,
  type ClientAuth,
  type HeadersValue,
  type SendTurnPayload,
  type SessionState,
} from "@flue-eve/client";
import type { EveEvent } from "@flue-eve/shared";

import type { InputResponse } from "./message-types.js";
import type { EveAgentReducer, EveAgentReducerEvent } from "./reducer.js";

export type EveAgentStoreStatus = "error" | "ready" | "streaming" | "submitted";

export type PrepareSend = (input: SendTurnPayload) => SendTurnPayload | Promise<SendTurnPayload>;

export interface EveAgentStoreSnapshot<TData> {
  readonly data: TData;
  readonly error: Error | undefined;
  readonly events: readonly EveEvent[];
  readonly session: SessionState;
  readonly status: EveAgentStoreStatus;
}

export interface EveAgentStoreCallbacks<TData> {
  readonly onError?: (error: Error) => void;
  readonly onEvent?: (event: EveEvent) => void;
  readonly onFinish?: (snapshot: EveAgentStoreSnapshot<TData>) => void;
  readonly onSessionChange?: (session: SessionState) => void;
  readonly prepareSend?: PrepareSend;
}

export interface EveAgentStoreInit<TData> {
  readonly auth?: ClientAuth;
  readonly headers?: HeadersValue;
  readonly host?: string;
  readonly initialEvents?: readonly EveEvent[];
  readonly initialSession?: SessionState;
  readonly maxReconnectAttempts?: number;
  readonly optimistic?: boolean;
  readonly reducer: EveAgentReducer<TData>;
  readonly session?: ClientSession;
}

export class EveAgentStore<TData> {
  readonly #createSession: (() => ClientSession) | undefined;
  readonly #optimistic: boolean;
  readonly #reducer: EveAgentReducer<TData>;
  readonly #subscribers = new Set<() => void>();

  #abortController: AbortController | undefined;
  #callbacks: EveAgentStoreCallbacks<TData> = {};
  #data: TData;
  #error: Error | undefined;
  #events: readonly EveEvent[];
  #operationId = 0;
  #pendingSubmission: { id: string; message: string; createdAt: number } | undefined;
  #projectionEvents: readonly EveAgentReducerEvent[];
  #session: ClientSession;
  #snapshot: EveAgentStoreSnapshot<TData>;
  #status: EveAgentStoreStatus = "ready";

  constructor(init: EveAgentStoreInit<TData>) {
    this.#createSession = init.session
      ? undefined
      : () =>
          new Client({
            auth: init.auth,
            headers: init.headers,
            host: init.host ?? "",
            maxReconnectAttempts: init.maxReconnectAttempts,
          }).session(init.initialSession);
    this.#events = [...(init.initialEvents ?? [])];
    this.#projectionEvents = [...this.#events];
    this.#optimistic = init.optimistic ?? true;
    this.#reducer = init.reducer;
    this.#session = init.session ?? this.#createOwnedSession();
    this.#data = this.#reduceProjection(this.#projectionEvents);
    this.#snapshot = this.#createSnapshot();
  }

  get snapshot(): EveAgentStoreSnapshot<TData> {
    return this.#snapshot;
  }

  setCallbacks(callbacks: EveAgentStoreCallbacks<TData>): void {
    this.#callbacks = callbacks;
  }

  subscribe(callback: () => void): () => void {
    this.#subscribers.add(callback);
    return () => this.#subscribers.delete(callback);
  }

  async send(input: SendTurnPayload): Promise<void> {
    if (this.#status === "streaming" || this.#status === "submitted") {
      throw new Error("Eve session is already processing a turn.");
    }

    const operationId = this.#startOperation();
    const abortController = new AbortController();
    this.#abortController = abortController;
    this.#error = undefined;
    this.#status = "submitted";
    this.#publish();

    try {
      const prepared = (await this.#callbacks.prepareSend?.(input)) ?? input;
      if (!this.#isCurrent(operationId)) return;

      this.#projectOptimistic(prepared);
      this.#projectInputResponses(prepared);
      this.#publish();

      const response = await this.#session.send({
        ...prepared,
        signal: mergeAbort(prepared.signal, abortController.signal),
      });

      let sawEvent = false;
      for await (const event of response) {
        if (!this.#isCurrent(operationId)) return;
        if (!sawEvent) {
          sawEvent = true;
          this.#status = "streaming";
        }
        this.#events = [...this.#events, event];
        this.#applyServerEvent(event);
        this.#callbacks.onEvent?.(event);
        this.#applyTerminalFailure(event);
        this.#publish();
      }

      if (!this.#isCurrent(operationId)) return;
      this.#status = this.#error ? "error" : "ready";
    } catch (error) {
      if (!this.#isCurrent(operationId)) return;
      if (isAbortError(error)) {
        this.#status = "ready";
        this.#failPending(toError(error));
      } else {
        this.#error = toError(error);
        this.#status = "error";
        this.#failPending(this.#error);
        this.#callbacks.onError?.(this.#error);
      }
    } finally {
      if (this.#isCurrent(operationId)) {
        this.#abortController = undefined;
        this.#callbacks.onSessionChange?.(this.#session.state);
        this.#publish();
        this.#callbacks.onFinish?.(this.#snapshot);
      }
    }
  }

  stop(): void {
    this.#abortController?.abort();
  }

  reset(): void {
    this.#invalidateOperation();
    this.stop();
    this.#session = this.#createSession?.() ?? this.#session;
    this.#events = [];
    this.#projectionEvents = [];
    this.#pendingSubmission = undefined;
    this.#data = this.#reducer.initial();
    this.#error = undefined;
    this.#status = "ready";
    this.#callbacks.onSessionChange?.(this.#session.state);
    this.#publish();
  }

  #createOwnedSession(): ClientSession {
    if (!this.#createSession) throw new Error("Cannot create owned session.");
    return this.#createSession();
  }

  #startOperation(): number {
    this.#operationId += 1;
    return this.#operationId;
  }

  #invalidateOperation(): void {
    this.#operationId += 1;
  }

  #isCurrent(operationId: number): boolean {
    return operationId === this.#operationId;
  }

  #projectInputResponses(input: SendTurnPayload): void {
    if (input.inputResponses === undefined || input.inputResponses.length === 0) return;
    this.#appendProjection({
      type: "client.input.responded",
      data: {
        createdAt: Date.now(),
        responses: input.inputResponses as unknown as readonly InputResponse[],
      },
    });
  }

  #projectOptimistic(input: SendTurnPayload): void {
    if (!this.#optimistic || input.message === undefined) return;
    const id = crypto.randomUUID();
    const pending = { id, message: String(input.message), createdAt: Date.now() };
    this.#pendingSubmission = pending;
    this.#appendProjection({
      type: "client.message.submitted",
      data: { createdAt: pending.createdAt, message: pending.message, submissionId: id },
    });
  }

  #applyServerEvent(event: EveEvent): void {
    if (event.type === "message.received" && this.#pendingSubmission) {
      const submissionId = this.#pendingSubmission.id;
      this.#pendingSubmission = undefined;
      this.#replaceProjection(
        (candidate) =>
          candidate.type === "client.message.submitted" &&
          candidate.data.submissionId === submissionId,
        event,
      );
      return;
    }
    this.#appendProjection(event);
  }

  #applyTerminalFailure(event: EveEvent): void {
    if (event.type !== "session.failed") return;
    const message = String(event.data.message ?? "Session failed");
    const error = new Error(message);
    error.name = String(event.data.code ?? "session.failed");
    this.#status = "error";
    this.#failPending(error);
    if (!this.#error) {
      this.#error = error;
      this.#callbacks.onError?.(error);
    }
  }

  #failPending(error: Error): void {
    const pending = this.#pendingSubmission;
    if (!pending) return;
    this.#pendingSubmission = undefined;
    this.#replaceProjection(
      (event) =>
        event.type === "client.message.submitted" && event.data.submissionId === pending.id,
      {
        type: "client.message.failed",
        data: {
          createdAt: pending.createdAt,
          error: { message: error.message },
          message: pending.message,
          submissionId: pending.id,
        },
      },
    );
  }

  #appendProjection(event: EveAgentReducerEvent): void {
    this.#projectionEvents = [...this.#projectionEvents, event];
    this.#data = this.#reducer.reduce(this.#data, event);
  }

  #replaceProjection(
    predicate: (event: EveAgentReducerEvent) => boolean,
    replacement: EveAgentReducerEvent,
  ): void {
    let replaced = false;
    this.#projectionEvents = this.#projectionEvents.map((event) => {
      if (!replaced && predicate(event)) {
        replaced = true;
        return replacement;
      }
      return event;
    });
    if (!replaced) this.#projectionEvents = [...this.#projectionEvents, replacement];
    this.#data = this.#reduceProjection(this.#projectionEvents);
  }

  #reduceProjection(events: readonly EveAgentReducerEvent[]): TData {
    let data = this.#reducer.initial();
    for (const event of events) data = this.#reducer.reduce(data, event);
    return data;
  }

  #createSnapshot(): EveAgentStoreSnapshot<TData> {
    return {
      data: this.#data,
      error: this.#error,
      events: this.#events,
      session: this.#session.state,
      status: this.#status,
    };
  }

  #publish(): void {
    this.#snapshot = this.#createSnapshot();
    for (const subscriber of this.#subscribers) subscriber();
  }
}

function mergeAbort(first: AbortSignal | undefined, second: AbortSignal): AbortSignal {
  if (!first) return second;
  if (typeof AbortSignal.any === "function") return AbortSignal.any([first, second]);
  const controller = new AbortController();
  const onAbort = () => {
    controller.abort((first.aborted ? first : second).reason);
  };
  first.addEventListener("abort", onAbort, { once: true });
  second.addEventListener("abort", onAbort, { once: true });
  if (first.aborted || second.aborted) controller.abort();
  return controller.signal;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}