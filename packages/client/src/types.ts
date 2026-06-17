import type { EveEvent } from "@flue-eve/shared";

export type TokenValue = string | (() => string | Promise<string>);

export type HeadersValue =
  | Readonly<Record<string, string>>
  | (() => Readonly<Record<string, string>> | Promise<Readonly<Record<string, string>>>);

export type ClientAuth =
  | { readonly basic: { readonly username: string; readonly password: TokenValue } }
  | { readonly bearer: TokenValue };

export interface ClientOptions {
  readonly host?: string;
  readonly auth?: ClientAuth;
  readonly headers?: HeadersValue;
  readonly maxReconnectAttempts?: number;
  readonly preserveCompletedSessions?: boolean;
}

export interface SessionState {
  readonly continuationToken?: string;
  readonly sessionId?: string;
  readonly streamIndex: number;
}

export type SendTurnInput<TOutput = unknown> = string | SendTurnPayload<TOutput>;

export interface SendTurnPayload<TOutput = unknown> {
  readonly message?: string;
  readonly agent?: string;
  readonly continuationToken?: string;
  readonly clientContext?: string | readonly string[] | Record<string, unknown>;
  readonly inputResponses?: readonly Record<string, unknown>[];
  readonly outputSchema?: Record<string, unknown>;
  readonly signal?: AbortSignal;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface StreamOptions {
  readonly startIndex?: number;
  readonly signal?: AbortSignal;
}

export interface HealthResult {
  readonly ok: true;
  readonly status: string;
  readonly workflowId: string;
}

export interface AgentInfoResult {
  readonly model?: { readonly id: string };
  readonly agent?: { readonly name: string };
  readonly agents?: readonly {
    readonly name: string;
    readonly description: string;
    readonly model: { readonly id: string };
    readonly tools: readonly { readonly name: string; readonly description?: string }[];
  }[];
  readonly tools?: readonly { readonly name: string; readonly description?: string }[];
}

export interface MessageResult<TOutput = unknown> {
  readonly sessionId: string;
  readonly status: "completed" | "failed" | "waiting";
  readonly message?: string;
  readonly events: readonly EveEvent[];
  readonly inputRequests: readonly Record<string, unknown>[];
  readonly data: TOutput | undefined;
}

export type HandleMessageStreamEvent = EveEvent;