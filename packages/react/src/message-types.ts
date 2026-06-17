export interface InputResponse {
  readonly optionId?: string;
  readonly requestId: string;
  readonly text?: string;
}

export interface EveMessageData {
  readonly messages: readonly EveMessage[];
}

export interface EveMessage {
  readonly id: string;
  readonly metadata?: EveMessageMetadata;
  readonly parts: readonly EveMessagePart[];
  readonly role: "assistant" | "user";
}

export interface EveMessageMetadata {
  readonly optimistic?: true;
  readonly result?: unknown;
  readonly status?: "complete" | "failed" | "streaming" | "submitted";
  readonly turnId?: string;
}

export interface EveMessageInputRequest {
  readonly allowFreeform?: boolean;
  readonly display?: string;
  readonly options?: readonly { readonly id: string; readonly label: string; readonly style?: string }[];
  readonly prompt?: string;
  readonly requestId: string;
}

export interface EveMessageToolMetadata {
  readonly eve?: {
    readonly inputRequest?: EveMessageInputRequest;
    readonly inputResponse?: InputResponse;
    readonly kind: "load-skill" | "subagent-call" | "tool-call" | "unknown";
    readonly name: string;
  };
}

export type EveDynamicToolPart = {
  readonly stepIndex?: number;
  readonly toolCallId: string;
  readonly toolMetadata?: EveMessageToolMetadata;
  readonly toolName: string;
  readonly type: "dynamic-tool";
} & (
  | {
      readonly approval?: never;
      readonly errorText?: never;
      readonly input: unknown | undefined;
      readonly output?: never;
      readonly state: "input-streaming";
    }
  | {
      readonly approval?: never;
      readonly errorText?: never;
      readonly input: unknown;
      readonly output?: never;
      readonly state: "input-available";
    }
  | {
      readonly approval: { readonly id: string; readonly approved?: never; readonly reason?: never; readonly isAutomatic?: boolean };
      readonly errorText?: never;
      readonly input: unknown;
      readonly output?: never;
      readonly state: "approval-requested";
    }
  | {
      readonly approval: { readonly id: string; readonly approved?: boolean; readonly reason?: string; readonly isAutomatic?: boolean };
      readonly errorText?: never;
      readonly input: unknown;
      readonly output?: never;
      readonly state: "approval-responded";
    }
  | {
      readonly approval?: { readonly id: string; readonly approved: false; readonly reason?: string; readonly isAutomatic?: boolean };
      readonly errorText?: never;
      readonly input?: unknown;
      readonly output?: never;
      readonly state: "output-denied";
    }
  | {
      readonly approval?: { readonly id: string; readonly approved: true; readonly reason?: string; readonly isAutomatic?: boolean };
      readonly errorText?: string;
      readonly input?: unknown;
      readonly output?: unknown;
      readonly state: "output-available";
    }
  | {
      readonly approval?: { readonly id: string; readonly approved?: boolean; readonly reason?: string; readonly isAutomatic?: boolean };
      readonly errorText: string;
      readonly input?: unknown;
      readonly output?: never;
      readonly state: "output-error";
    }
);

export type EveMessagePart =
  | {
      readonly state?: "done" | "streaming";
      readonly stepIndex?: number;
      readonly text: string;
      readonly type: "text";
    }
  | {
      readonly state?: "done" | "streaming";
      readonly stepIndex?: number;
      readonly text: string;
      readonly type: "reasoning";
    }
  | { readonly type: "step-start" }
  | EveDynamicToolPart;