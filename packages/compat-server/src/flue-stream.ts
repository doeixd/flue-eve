import { stream as dsStream } from "@durable-streams/client";
import type { FlueEvent } from "@flue-eve/shared";

export interface ConsumeFlueStreamOptions {
  readonly url: string;
  readonly offset: string;
  readonly submissionId?: string;
  readonly signal?: AbortSignal;
  readonly fetch?: typeof globalThis.fetch;
}

/** Consume one Flue agent prompt's events from a Durable Stream until settled. */
export async function* consumeFlueAgentStream(
  options: ConsumeFlueStreamOptions,
): AsyncGenerator<FlueEvent> {
  const fetch = options.fetch ?? globalThis.fetch;
  let offset = options.offset;

  for (let idleRounds = 0; idleRounds < 60; idleRounds += 1) {
    const response = await dsStream<FlueEvent>({
      url: options.url,
      offset,
      live: "long-poll",
      json: true,
      signal: options.signal,
      fetch,
      warnOnHttp: false,
    });

    const batch = await response.json();
    for (const event of batch) {
      yield event;
      if (isTurnTerminal(event, options.submissionId)) return;
    }

    if (response.upToDate) return;

    offset = response.offset;
  }
}

export function isTurnTerminal(event: FlueEvent, submissionId?: string): boolean {
  if (event.type === "idle") return true;
  if (event.type === "submission_settled") {
    if (!submissionId) return true;
    return "submissionId" in event && event.submissionId === submissionId;
  }
  if (event.type === "submission-settled") return true;
  return false;
}