export type EveEventType =
  | "session.started"
  | "turn.started"
  | "message.received"
  | "step.started"
  | "message.appended"
  | "message.completed"
  | "reasoning.appended"
  | "reasoning.completed"
  | "actions.requested"
  | "action.result"
  | "step.completed"
  | "turn.completed"
  | "session.waiting"
  | "session.completed"
  | "session.failed"
  | "turn.failed"
  | "step.failed"
  | "authorization.required"
  | "authorization.completed"
  | "input.requested"
  | "result.completed";

export interface EveEventBase {
  readonly type: EveEventType;
  readonly data: Record<string, unknown>;
  readonly meta?: { readonly at: string };
}

export type EveEvent = EveEventBase;

export function isCurrentTurnBoundaryEvent(event: EveEvent): boolean {
  return (
    event.type === "session.completed" ||
    event.type === "session.failed" ||
    event.type === "session.waiting"
  );
}

export function createTurnStartedEvent(input: {
  turnId: string;
  sequence: number;
}): EveEvent {
  return { type: "turn.started", data: { ...input } };
}

export function createMessageReceivedEvent(input: {
  message: string;
  turnId: string;
  sequence: number;
}): EveEvent {
  return { type: "message.received", data: { ...input } };
}

export function createMessageAppendedEvent(input: {
  messageDelta: string;
  messageSoFar: string;
  turnId: string;
  sequence: number;
  stepIndex: number;
}): EveEvent {
  return { type: "message.appended", data: { ...input } };
}

export function createMessageCompletedEvent(input: {
  message: string;
  turnId: string;
  sequence: number;
  stepIndex: number;
  finishReason?: string;
}): EveEvent {
  return {
    type: "message.completed",
    data: { finishReason: "stop", ...input },
  };
}

export function createTurnCompletedEvent(input: {
  turnId: string;
  sequence: number;
}): EveEvent {
  return { type: "turn.completed", data: { ...input } };
}

export function createSessionWaitingEvent(): EveEvent {
  return {
    type: "session.waiting",
    data: { wait: "next-user-message" },
  };
}

export function createSessionStartedEvent(): EveEvent {
  return { type: "session.started", data: {} };
}

export function createSessionFailedEvent(input: {
  code: string;
  message: string;
  sessionId: string;
}): EveEvent {
  return {
    type: "session.failed",
    data: {
      code: input.code,
      message: input.message,
      sessionId: input.sessionId,
    },
  };
}

export function createActionsRequestedEvent(input: {
  actions: readonly Record<string, unknown>[];
  turnId: string;
  sequence: number;
  stepIndex: number;
}): EveEvent {
  return { type: "actions.requested", data: { ...input } };
}

export function createSessionCompletedEvent(): EveEvent {
  return { type: "session.completed", data: {} };
}

export function createResultCompletedEvent(input: {
  result: unknown;
  turnId: string;
  sequence: number;
  stepIndex: number;
}): EveEvent {
  return { type: "result.completed", data: { ...input } };
}

export function createInputRequestedEvent(input: {
  requests: readonly Record<string, unknown>[];
  turnId: string;
  sequence: number;
  stepIndex: number;
}): EveEvent {
  return { type: "input.requested", data: { ...input } };
}

export function createStepStartedEvent(input: {
  turnId: string;
  sequence: number;
  stepIndex: number;
}): EveEvent {
  return { type: "step.started", data: { ...input } };
}

export function createStepFailedEvent(input: {
  code: string;
  message: string;
  turnId: string;
  sequence: number;
  stepIndex: number;
  details?: Record<string, unknown>;
}): EveEvent {
  return { type: "step.failed", data: { ...input } };
}

export function createTurnFailedEvent(input: {
  code: string;
  message: string;
  turnId: string;
  sequence: number;
  details?: Record<string, unknown>;
}): EveEvent {
  return { type: "turn.failed", data: { ...input } };
}

export function createReasoningCompletedEvent(input: {
  reasoning: string;
  turnId: string;
  sequence: number;
  stepIndex: number;
}): EveEvent {
  return { type: "reasoning.completed", data: { ...input } };
}

export function createReasoningAppendedEvent(input: {
  reasoningDelta: string;
  reasoningSoFar: string;
  turnId: string;
  sequence: number;
  stepIndex: number;
}): EveEvent {
  return { type: "reasoning.appended", data: { ...input } };
}