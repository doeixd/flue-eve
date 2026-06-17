import type { FlueEvent } from "@flue-eve/shared";

import { isTurnTerminal } from "../flue-stream.js";
import type { AdmitTurnInput, FlueAdmissionAdapter } from "../types.js";

export interface InProcessDirectPayload {
  readonly message: string;
  readonly images?: readonly unknown[];
}

export type InProcessAttachedAdmission = (
  payload: InProcessDirectPayload,
  onEvent?: (event: Record<string, unknown>) => void | Promise<void>,
  waitForResult?: boolean,
) => Promise<{ readonly submissionId: string; readonly result?: unknown }>;

export interface InProcessEventStreamStore {
  getStreamMeta(path: string): Promise<{ readonly nextOffset: string; readonly closed: boolean } | null>;
  readEvents(
    path: string,
    opts?: { readonly offset?: string; readonly limit?: number },
  ): Promise<{
    readonly events: ReadonlyArray<{ readonly data: unknown; readonly offset: string }>;
    readonly nextOffset: string;
    readonly upToDate: boolean;
    readonly closed: boolean;
  }>;
}

export interface InProcessAdmissionHooks {
  readonly createAdmission: Readonly<Record<string, (instanceId: string) => InProcessAttachedAdmission>>;
  readonly eventStreamStore: InProcessEventStreamStore;
}

export interface InProcessAdmissionOptions {
  readonly agentName: string;
  readonly hooks: InProcessAdmissionHooks;
}

/** Flue agent stream path (`agents/:name/:id`) used by {@link EventStreamStore}. */
export function agentStreamPath(agentName: string, instanceId: string): string {
  return `agents/${agentName}/${instanceId}`;
}

/**
 * In-process Flue admission — admit via runtime `createAdmission`, consume events
 * from the co-located {@link EventStreamStore} (no HTTP loopback).
 */
export function createInProcessAdmission(options: InProcessAdmissionOptions): FlueAdmissionAdapter {
  const { agentName, hooks } = options;

  return {
    async *admitTurn(input: AdmitTurnInput): AsyncIterable<FlueEvent> {
      const targetAgent = input.agentName || agentName;
      const admitFactory = hooks.createAdmission[targetAgent];
      if (admitFactory === undefined) {
        yield {
          type: "error",
          message: `Agent "${targetAgent}" is not registered for in-process admission.`,
          code: "agent_not_found",
        };
        return;
      }

      const streamPath = agentStreamPath(targetAgent, input.sessionId);
      const meta = await hooks.eventStreamStore.getStreamMeta(streamPath);
      const startOffset = meta?.nextOffset ?? "-1";

      const payload = toDirectAgentPayload(input);
      let receipt: { readonly submissionId: string };
      try {
        receipt = await admitFactory(input.sessionId)(payload, undefined, false);
      } catch (error) {
        const message = error instanceof Error ? error.message : "In-process admission failed";
        yield { type: "error", message, code: "admission_failed" };
        return;
      }

      yield* consumeInProcessFlueStream({
        eventStreamStore: hooks.eventStreamStore,
        streamPath,
        offset: startOffset,
        submissionId: receipt.submissionId,
      });
    },
  };
}

function toDirectAgentPayload(input: AdmitTurnInput): InProcessDirectPayload & Record<string, unknown> {
  const payload: InProcessDirectPayload & Record<string, unknown> = { message: input.message };
  // Flue DirectAgentPayload is message + images; Eve extras are forwarded for HTTP parity.
  if (input.inputResponses !== undefined && input.inputResponses.length > 0) {
    payload.inputResponses = input.inputResponses;
  }
  if (input.outputSchema !== undefined) payload.outputSchema = input.outputSchema;
  if (input.clientContext !== undefined) payload.clientContext = input.clientContext;
  return payload;
}

export interface ConsumeInProcessFlueStreamOptions {
  readonly eventStreamStore: InProcessEventStreamStore;
  readonly streamPath: string;
  readonly offset: string;
  readonly submissionId?: string;
}

/** Read one admitted turn from an in-process {@link EventStreamStore}. */
export async function* consumeInProcessFlueStream(
  options: ConsumeInProcessFlueStreamOptions,
): AsyncGenerator<FlueEvent> {
  let offset = options.offset;

  for (let idleRounds = 0; idleRounds < 120; idleRounds += 1) {
    const result = await options.eventStreamStore.readEvents(options.streamPath, { offset });

    for (const { data } of result.events) {
      const event = data as FlueEvent;
      yield event;
      if (isTurnTerminal(event, options.submissionId)) return;
    }

    if (result.upToDate || result.closed) return;

    offset = result.nextOffset;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
}