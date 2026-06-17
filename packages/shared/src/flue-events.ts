/** Flue agent stream events (subset aligned with @flue/sdk types). */

export type FlueTextDeltaEvent = {
  readonly type: "text_delta";
  readonly text: string;
  readonly turnId?: string;
  readonly submissionId?: string;
};

export type FlueThinkingDeltaEvent = {
  readonly type: "thinking_delta";
  readonly delta: string;
  readonly turnId?: string;
};

export type FlueToolStartEvent = {
  readonly type: "tool_start";
  readonly toolName: string;
  readonly toolCallId: string;
  readonly args?: unknown;
  readonly turnId?: string;
};

export type FlueToolEvent = {
  readonly type: "tool";
  readonly toolName: string;
  readonly toolCallId: string;
  readonly isError: boolean;
  readonly result?: unknown;
  readonly durationMs: number;
  readonly turnId?: string;
};

export type FlueIdleEvent = {
  readonly type: "idle";
  readonly submissionId?: string;
};

export type FlueSubmissionSettledEvent = {
  readonly type: "submission_settled";
  readonly submissionId: string;
  readonly outcome: "completed" | "failed";
  readonly error?: string;
};

export type FlueOperationStartEvent = {
  readonly type: "operation_start";
  readonly operationId: string;
  readonly operationKind: string;
  readonly submissionId?: string;
};

export type FlueLogEvent = {
  readonly type: "log";
  readonly level: "info" | "warn" | "error";
  readonly message: string;
};

export type FlueErrorEvent = {
  readonly type: "error";
  readonly message: string;
  readonly code?: string;
};

/** Extension event until Flue SDK exposes native HITL stream shapes. */
export type FlueHitlRequestedEvent = {
  readonly type: "hitl_requested";
  readonly requests: readonly Record<string, unknown>[];
  readonly turnId?: string;
};

/** Tool call denied at an approval gate (maps to Eve `action.result` rejected). */
export type FlueToolRejectedEvent = {
  readonly type: "tool_rejected";
  readonly toolCallId: string;
  readonly toolName: string;
  readonly reason?: string;
  readonly turnId?: string;
};

/** MCP / connection OAuth challenge (maps to Eve `authorization.required`). */
export type FlueAuthorizationRequiredEvent = {
  readonly type: "authorization_required";
  readonly name: string;
  readonly description: string;
  readonly authorization?: Record<string, unknown>;
  readonly webhookUrl?: string;
  readonly turnId?: string;
};

/** Structured output result (maps to Eve `result.completed`). */
export type FlueResultCompletedEvent = {
  readonly type: "result_completed";
  readonly result: unknown;
  readonly turnId?: string;
};

/** OAuth resolved (maps to Eve `authorization.completed`). */
export type FlueAuthorizationCompletedEvent = {
  readonly type: "authorization_completed";
  readonly name: string;
  readonly outcome: "authorized" | "declined" | "failed" | "timed-out";
  readonly reason?: string;
  readonly authorization?: Record<string, unknown>;
  readonly turnId?: string;
};

/** Legacy mock shapes (dev/tests). */
export type FlueLegacyTextDeltaEvent = { readonly type: "text-delta"; readonly delta: string };
export type FlueLegacyTextDoneEvent = { readonly type: "text-done"; readonly text: string };
export type FlueLegacyToolCallEvent = {
  readonly type: "tool-call";
  readonly toolCallId: string;
  readonly toolName: string;
  readonly input: unknown;
};
export type FlueLegacyToolResultEvent = {
  readonly type: "tool-result";
  readonly toolCallId: string;
  readonly toolName: string;
  readonly result: unknown;
  readonly isError?: boolean;
};
export type FlueLegacySubmissionSettledEvent = { readonly type: "submission-settled" };

export type FlueEvent =
  | FlueTextDeltaEvent
  | FlueThinkingDeltaEvent
  | FlueToolStartEvent
  | FlueToolEvent
  | FlueHitlRequestedEvent
  | FlueToolRejectedEvent
  | FlueAuthorizationRequiredEvent
  | FlueAuthorizationCompletedEvent
  | FlueResultCompletedEvent
  | FlueIdleEvent
  | FlueSubmissionSettledEvent
  | FlueOperationStartEvent
  | FlueLogEvent
  | FlueErrorEvent
  | FlueLegacyTextDeltaEvent
  | FlueLegacyTextDoneEvent
  | FlueLegacyToolCallEvent
  | FlueLegacyToolResultEvent
  | FlueLegacySubmissionSettledEvent
  | { readonly type: string; readonly [key: string]: unknown };

export interface FlueAgentSendResult {
  readonly streamUrl: string;
  readonly offset: string;
  readonly submissionId: string;
}