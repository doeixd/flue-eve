import { EVE_HEALTH_ROUTE_PATH, EVE_INFO_ROUTE_PATH } from "@flue-eve/shared";

import { ClientError } from "./client-error.js";
import { ClientSession } from "./session.js";
import { createInitialSessionState } from "./session-utils.js";
import { createClientUrl } from "./url.js";
import type {
  AgentInfoResult,
  ClientAuth,
  ClientOptions,
  HeadersValue,
  HealthResult,
  SessionState,
  TokenValue,
} from "./types.js";

export class Client {
  readonly #auth: ClientAuth | undefined;
  readonly #headers: HeadersValue | undefined;
  readonly #host: string;
  readonly #maxReconnectAttempts: number;
  readonly #preserveCompletedSessions: boolean;

  constructor(options: ClientOptions = {}) {
    this.#host = options.host ?? "";
    this.#auth = options.auth;
    this.#headers = options.headers;
    this.#maxReconnectAttempts = options.maxReconnectAttempts ?? 3;
    this.#preserveCompletedSessions = options.preserveCompletedSessions ?? false;
  }

  async health(): Promise<HealthResult> {
    const url = createClientUrl(this.#host, EVE_HEALTH_ROUTE_PATH);
    const headers = await this.#resolveHeaders();
    const response = await fetch(url, { headers });
    if (!response.ok) throw new ClientError(response.status, await response.text());
    return (await response.json()) as HealthResult;
  }

  async info(): Promise<AgentInfoResult> {
    const url = createClientUrl(this.#host, EVE_INFO_ROUTE_PATH);
    const headers = await this.#resolveHeaders();
    const response = await fetch(url, { headers });
    if (!response.ok) throw new ClientError(response.status, await response.text());
    return (await response.json()) as AgentInfoResult;
  }

  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const url = createClientUrl(this.#host, path);
    const headers = await this.#resolveHeaders(headersInitToRecord(init.headers));
    return fetch(url, { ...init, headers });
  }

  session(state?: SessionState | string): ClientSession {
    let resolved: SessionState;
    if (typeof state === "string") {
      resolved = { continuationToken: state, streamIndex: 0 };
    } else if (state) {
      resolved = state;
    } else {
      resolved = createInitialSessionState();
    }

    return new ClientSession(
      {
        host: this.#host,
        maxReconnectAttempts: this.#maxReconnectAttempts,
        preserveCompletedSessions: this.#preserveCompletedSessions,
        resolveHeaders: (perRequest) => this.#resolveHeaders(perRequest),
      },
      resolved,
    );
  }

  async #resolveHeaders(
    perRequest?: Readonly<Record<string, string>>,
  ): Promise<Headers> {
    const headers = new Headers();

    const staticHeaders = await resolveHeadersValue(this.#headers);
    for (const [key, value] of Object.entries(staticHeaders)) {
      headers.set(key, value);
    }

    if (this.#auth) {
      if ("bearer" in this.#auth) {
        headers.set("authorization", `Bearer ${await resolveToken(this.#auth.bearer)}`);
      } else if ("basic" in this.#auth) {
        const password = await resolveToken(this.#auth.basic.password);
        const encoded = btoa(`${this.#auth.basic.username}:${password}`);
        headers.set("authorization", `Basic ${encoded}`);
      }
    }

    if (perRequest) {
      for (const [key, value] of Object.entries(perRequest)) {
        headers.set(key, value);
      }
    }

    return headers;
  }
}

async function resolveToken(value: TokenValue): Promise<string> {
  return typeof value === "function" ? await value() : value;
}

async function resolveHeadersValue(
  value: HeadersValue | undefined,
): Promise<Readonly<Record<string, string>>> {
  if (!value) return {};
  return typeof value === "function" ? await value() : value;
}

function headersInitToRecord(
  init: HeadersInit | undefined,
): Readonly<Record<string, string>> | undefined {
  if (!init) return undefined;
  if (init instanceof Headers) {
    const record: Record<string, string> = {};
    init.forEach((value, key) => {
      record[key] = value;
    });
    return record;
  }
  if (Array.isArray(init)) return Object.fromEntries(init);
  return init;
}