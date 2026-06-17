import type { FlueAdmissionAdapter } from "./types.js";

export interface OtelAdapter {
  readonly tracer: {
    startActiveSpan<T>(name: string, fn: (span: OtelSpan) => T): T;
  };
}

export interface OtelSpan {
  setAttributes(attrs: Record<string, unknown>): void;
  end(): void;
  recordException(error: unknown): void;
}

import { createRequire } from "node:module";

let otelAdapter: OtelAdapter | undefined;

function tryLoadOtel(): OtelAdapter | undefined {
  try {
    const _require = createRequire(import.meta.url);
    const { trace, SpanStatusCode } = _require("@opentelemetry/api") as {
      trace: {
        getTracer(name: string): {
          startActiveSpan<T>(name: string, options: unknown, fn: (span: unknown) => T): T;
        };
      };
      SpanStatusCode: { ERROR: number };
    };
    const tracer = trace.getTracer("flue-eve");
    return {
      tracer: {
        startActiveSpan<T>(name: string, fn: (span: OtelSpan) => T): T {
          return tracer.startActiveSpan(name, {}, (span: unknown) => {
            const wrapped: OtelSpan = {
              setAttributes(attrs) {
                (span as { setAttributes(a: Record<string, unknown>): void }).setAttributes(attrs);
              },
              end() {
                (span as { end(): void }).end();
              },
              recordException(error) {
                (span as { recordException(e: unknown): void }).recordException(error);
                (span as { setStatus(s: { code: number }): void }).setStatus({ code: SpanStatusCode.ERROR });
              },
            };
            return fn(wrapped);
          });
        },
      },
    };
  } catch {
    return undefined;
  }
}

export function getOtelAdapter(): OtelAdapter | undefined {
  if (otelAdapter === undefined) {
    otelAdapter = tryLoadOtel();
  }
  return otelAdapter;
}

export function clearOtelAdapter(): void {
  otelAdapter = undefined;
}

function wrapAsyncIterable<T>(
  iterable: AsyncIterable<T>,
  hooks: {
    onEvent(event: T): void;
    onError(error: unknown): void;
    onComplete(attrs: Record<string, unknown>): void;
  },
): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      const iterator = iterable[Symbol.asyncIterator]();
      let finished = false;
      return {
        async next() {
          if (finished) return { value: undefined as unknown as T, done: true };
          try {
            const result = await iterator.next();
            if (result.done) {
              finished = true;
              hooks.onComplete({});
            } else {
              hooks.onEvent(result.value);
            }
            return result;
          } catch (e) {
            finished = true;
            hooks.onError(e);
            hooks.onComplete({});
            throw e;
          }
        },
      };
    },
  };
}

export function wrapAdmission<T extends FlueAdmissionAdapter>(admission: T): T {
  const otel = getOtelAdapter();
  if (!otel) return admission;

  return {
    admitTurn(input) {
      const attrs: Record<string, unknown> = {
        "eve.session_id": input.sessionId,
        "eve.agent_name": input.agentName,
        "eve.is_first_turn": input.isFirstTurn,
      };

      let submissionId: string | undefined;
      let error: unknown;

      const stream = admission.admitTurn(input);

      return wrapAsyncIterable(stream, {
        onEvent(event) {
          if (typeof event === "object" && event !== null && "type" in event) {
            const e = event as { type: string; submissionId?: string };
            if (e.type === "submission_settled" && e.submissionId) {
              submissionId = e.submissionId;
            }
          }
        },
        onError(e) {
          error = e;
        },
        onComplete() {
          otel.tracer.startActiveSpan("flue-eve.admission", (span) => {
            if (submissionId) {
              attrs["flue.submission_id"] = submissionId;
            }
            span.setAttributes(attrs);
            if (error) span.recordException(error);
            span.end();
          });
        },
      });
    },
  } as T;
}

export function recordStreamMapping(
  sessionId: string,
  agentName: string,
  eventCount: number,
): void {
  const otel = getOtelAdapter();
  if (!otel) return;

  otel.tracer.startActiveSpan("flue-eve.stream_mapping", (span) => {
    span.setAttributes({
      "eve.session_id": sessionId,
      "eve.agent_name": agentName,
      "eve.stream_event_count": eventCount,
    });
    span.end();
  });
}
