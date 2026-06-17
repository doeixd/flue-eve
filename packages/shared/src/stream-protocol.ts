import { EVE_ROUTE_PREFIX } from "./constants.js";
import type { EveEvent } from "./events.js";

export type ActionResultStatus = "completed" | "failed" | "rejected";

export interface ActionResultError {
  readonly code: string;
  readonly message: string;
}

export type RuntimeActionResult =
  | {
      readonly callId: string;
      readonly kind: "tool-result";
      readonly toolName: string;
      readonly output: unknown;
      readonly isError?: boolean;
    }
  | {
      readonly callId: string;
      readonly kind: "subagent-result";
      readonly subagentName: string;
      readonly output: unknown;
      readonly isError?: boolean;
    }
  | {
      readonly callId: string;
      readonly kind: "load-skill-result";
      readonly name?: string;
      readonly output: unknown;
      readonly isError?: boolean;
    };

export type TimedEveEvent = EveEvent & { readonly meta: { readonly at: string } };

const textEncoder = new TextEncoder();

export function createEveConnectionCallbackRoutePath(name: string, token: string): string {
  return `${EVE_ROUTE_PREFIX}/connections/${encodeURIComponent(name)}/callback/${encodeURIComponent(token)}`;
}

export function createAuthorizationRequiredEvent(input: {
  readonly authorization?: Record<string, unknown>;
  readonly description: string;
  readonly name: string;
  readonly sequence: number;
  readonly stepIndex: number;
  readonly turnId: string;
  readonly webhookUrl?: string;
}): EveEvent {
  const data: Record<string, unknown> = {
    description: input.description,
    name: input.name,
    sequence: input.sequence,
    stepIndex: input.stepIndex,
    turnId: input.turnId,
  };
  if (input.authorization !== undefined) data.authorization = input.authorization;
  if (input.webhookUrl !== undefined) data.webhookUrl = input.webhookUrl;
  return { type: "authorization.required", data };
}

export function createAuthorizationCompletedEvent(input: {
  readonly authorization?: Record<string, unknown>;
  readonly name: string;
  readonly outcome: "authorized" | "declined" | "failed" | "timed-out";
  readonly reason?: string;
  readonly sequence: number;
  readonly stepIndex: number;
  readonly turnId: string;
}): EveEvent {
  const data: Record<string, unknown> = {
    name: input.name,
    outcome: input.outcome,
    sequence: input.sequence,
    stepIndex: input.stepIndex,
    turnId: input.turnId,
  };
  if (input.authorization !== undefined) data.authorization = input.authorization;
  if (input.reason !== undefined) data.reason = input.reason;
  return { type: "authorization.completed", data };
}

export function createActionResultEvent(input: {
  readonly rejected?: boolean;
  readonly result: RuntimeActionResult;
  readonly sequence: number;
  readonly stepIndex: number;
  readonly turnId: string;
}): EveEvent {
  const outcome =
    input.rejected === true
      ? { error: buildActionResultError(input.result), status: "rejected" as const }
      : normalizeActionResultOutcome(input.result);

  return {
    type: "action.result",
    data: {
      error: outcome.error,
      result: input.result,
      sequence: input.sequence,
      stepIndex: input.stepIndex,
      status: outcome.status,
      turnId: input.turnId,
    },
  };
}

export function timestampHandleMessageStreamEvent(
  event: EveEvent,
  at = new Date().toISOString(),
): TimedEveEvent {
  return { ...event, meta: { at } };
}

export function encodeMessageStreamEvent(event: TimedEveEvent): Uint8Array {
  return textEncoder.encode(`${JSON.stringify(event)}\n`);
}

function normalizeActionResultOutcome(result: RuntimeActionResult): {
  readonly error?: ActionResultError;
  readonly status: ActionResultStatus;
} {
  if (result.isError === true) {
    return { error: buildActionResultError(result), status: "failed" };
  }

  const outputError = readActionResultOutputError(result.output);
  if (outputError !== undefined) {
    return { error: outputError, status: "failed" };
  }

  return { status: "completed" };
}

function buildActionResultError(result: RuntimeActionResult): ActionResultError {
  const outputError = readActionResultOutputError(result.output);
  if (outputError !== undefined) return outputError;

  return {
    code: "ACTION_RESULT_FAILED",
    message: formatActionResultOutput(result.output),
  };
}

function readActionResultOutputError(output: unknown): ActionResultError | undefined {
  const record = parseActionResultOutputRecord(output);
  if (record === undefined) return undefined;

  const code = typeof record.code === "string" && record.code.length > 0 ? record.code : undefined;
  const message =
    typeof record.message === "string" && record.message.length > 0 ? record.message : undefined;

  if (code === undefined || message === undefined) return undefined;
  return { code, message };
}

function parseActionResultOutputRecord(output: unknown): Record<string, unknown> | undefined {
  if (output !== null && typeof output === "object") {
    return output as Record<string, unknown>;
  }

  if (typeof output !== "string") return undefined;

  const trimmed = output.trim();
  if (trimmed.length === 0) return undefined;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed !== null && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function formatActionResultOutput(output: unknown): string {
  if (typeof output === "string") return output;
  const serialized = JSON.stringify(output);
  if (typeof serialized === "string" && serialized.length > 0) return serialized;
  return "Action failed.";
}