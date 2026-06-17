import type { EveEvent } from "@flue-eve/shared";

export interface WorkflowRunRecord {
  readonly runId: string;
  readonly workflowName: string;
  readonly status: "active" | "completed" | "errored";
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly result?: unknown;
  readonly error?: unknown;
}

export interface WorkflowStreamChunk {
  readonly events: readonly WorkflowStreamEvent[];
  readonly nextOffset: string;
  readonly upToDate: boolean;
  readonly closed: boolean;
}

export type WorkflowStreamEvent =
  | { readonly type: "run_start"; readonly runId: string; readonly workflowName: string; readonly startedAt: string; readonly payload?: unknown }
  | { readonly type: "run_resume"; readonly runId: string; readonly workflowName: string; readonly startedAt: string }
  | { readonly type: "run_end"; readonly runId: string; readonly isError: boolean; readonly result?: unknown; readonly error?: unknown; readonly durationMs: number }
  | { readonly type: "text_delta"; readonly text: string }
  | { readonly type: "tool_start"; readonly toolName: string; readonly toolCallId: string; readonly args?: unknown }
  | { readonly type: "tool"; readonly toolName: string; readonly toolCallId: string; readonly isError: boolean; readonly result?: unknown }
  | { readonly type: "idle" };

export interface WorkflowAdmissionResult {
  readonly runId: string;
}

export interface EveWorkflowOptions {
  readonly basePath?: string;
  readonly fetch?: typeof fetch;
  readonly submitRun: (workflowName: string, payload: unknown) => Promise<WorkflowAdmissionResult>;
  readonly readStream: (runId: string, options?: { startIndex?: number }) => AsyncIterable<EveEvent>;
}
