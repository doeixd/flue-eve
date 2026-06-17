import type { EveAgentReducer, EveAgentReducerEvent } from "./reducer.js";
import type {
  EveDynamicToolPart,
  EveMessage,
  EveMessageData,
  EveMessageInputRequest,
  EveMessageMetadata,
  EveMessagePart,
  EveMessageToolMetadata,
  InputResponse,
} from "./message-types.js";

export type { EveMessageData, EveMessage, EveMessagePart } from "./message-types.js";

type EveAssistantMessage = EveMessage & { readonly role: "assistant" };

interface ActionDescriptor {
  readonly kind: "load-skill" | "subagent-call" | "tool-call";
  readonly name: string;
  readonly toolName: string;
}

export function defaultMessageReducer(): EveAgentReducer<EveMessageData> {
  return {
    initial: () => ({ messages: [] }),
    reduce: (data, event) => reduceMessageData(data, event),
  };
}

function reduceMessageData(data: EveMessageData, event: EveAgentReducerEvent): EveMessageData {
  switch (event.type) {
    case "client.message.submitted":
      return upsertMessage(data, {
        id: optimisticUserMessageId(event.data.submissionId),
        metadata: { optimistic: true, status: "submitted" },
        parts: [{ type: "text", text: event.data.message }],
        role: "user",
      });

    case "client.message.failed":
      return upsertMessage(data, {
        id: optimisticUserMessageId(event.data.submissionId),
        metadata: { optimistic: true, status: "failed" },
        parts: [{ type: "text", text: event.data.message }],
        role: "user",
      });

    case "client.input.responded": {
      let next = data;
      for (const response of event.data.responses) {
        next = respondToInputRequest(next, response);
      }
      return next;
    }

    case "message.received":
      return upsertMessage(data, {
        id: `${event.data.turnId}:user`,
        metadata: { status: "complete", turnId: String(event.data.turnId) },
        parts: [{ type: "text", text: String(event.data.message), state: "done" }],
        role: "user",
      });

    case "step.started":
      return updateAssistantMessage(data, String(event.data.turnId), (message) =>
        ensureStepStartPart(message, Number(event.data.stepIndex ?? 0)),
      );

    case "reasoning.appended":
      return updateAssistantMessage(data, String(event.data.turnId), (message) =>
        upsertPart(ensureStepStartPart(message, Number(event.data.stepIndex ?? 0)), {
          state: "streaming",
          stepIndex: Number(event.data.stepIndex ?? 0),
          text: String(event.data.reasoningSoFar ?? ""),
          type: "reasoning",
        }),
      );

    case "reasoning.completed":
      return updateAssistantMessage(data, String(event.data.turnId), (message) =>
        upsertPart(ensureStepStartPart(message, Number(event.data.stepIndex ?? 0)), {
          state: "done",
          stepIndex: Number(event.data.stepIndex ?? 0),
          text: String(event.data.reasoning ?? ""),
          type: "reasoning",
        }),
      );

    case "actions.requested": {
      let next = data;
      const actions = Array.isArray(event.data.actions) ? event.data.actions : [];
      for (const action of actions) {
        const descriptor = normalizeActionRequest(action as Record<string, unknown>);
        next = updateAssistantMessage(next, String(event.data.turnId), (message) =>
          upsertPart(ensureStepStartPart(message, Number(event.data.stepIndex ?? 0)), {
            input: (action as Record<string, unknown>).input,
            state: "input-available",
            stepIndex: Number(event.data.stepIndex ?? 0),
            toolCallId: String((action as Record<string, unknown>).callId ?? ""),
            toolMetadata: createToolMetadata(descriptor),
            toolName: descriptor.toolName,
            type: "dynamic-tool",
          }),
        );
      }
      return next;
    }

    case "input.requested": {
      let next = data;
      const requests = Array.isArray(event.data.requests) ? event.data.requests : [];
      for (const request of requests) {
        const record = request as Record<string, unknown>;
        const action = record.action as Record<string, unknown>;
        const descriptor = normalizeActionRequest(action);
        next = updateAssistantMessage(next, String(event.data.turnId), (message) =>
          upsertPart(ensureStepStartPart(message, Number(event.data.stepIndex ?? 0)), {
            approval: { id: String(record.requestId ?? "") },
            input: action.input,
            state: "approval-requested",
            stepIndex: Number(event.data.stepIndex ?? 0),
            toolCallId: String(action.callId ?? ""),
            toolMetadata: createToolMetadata(descriptor, {
              inputRequest: toMessageInputRequest(record),
            }),
            toolName: descriptor.toolName,
            type: "dynamic-tool",
          }),
        );
      }
      return next;
    }

    case "action.result": {
      const result = event.data.result as Record<string, unknown>;
      const descriptor = normalizeActionResult(result);
      const existing = findToolPart(data, String(result.callId ?? ""));
      const error = event.data.error as { code?: string; message?: string } | undefined;
      const denied =
        event.data.status === "rejected" || error?.code === "TOOL_EXECUTION_DENIED";
      const failed = event.data.status === "failed" && !denied;
      const approvalId = existing?.approval?.id ?? String(result.callId ?? "");
      const toolMetadata = mergeToolMetadata(existing?.toolMetadata, createToolMetadata(descriptor));
      const resultPartBase = {
        input: existing?.input,
        stepIndex: Number(event.data.stepIndex ?? 0),
        toolCallId: String(result.callId ?? ""),
        toolMetadata,
        toolName: existing?.toolName ?? descriptor.toolName,
        type: "dynamic-tool" as const,
      };

      let nextPart: EveDynamicToolPart;
      if (denied) {
        nextPart = {
          ...resultPartBase,
          approval: { approved: false, id: approvalId, reason: error?.message },
          state: "output-denied",
        };
      } else if (failed) {
        nextPart = {
          ...resultPartBase,
          approval: approvedApproval(existing),
          errorText: error?.message ?? stringifyUnknown(result.output),
          state: "output-error",
        };
      } else {
        nextPart = {
          ...resultPartBase,
          approval: approvedApproval(existing),
          output: result.output,
          state: "output-available",
        };
      }

      if (existing !== undefined) {
        return updateToolPart(data, String(result.callId ?? ""), nextPart);
      }

      return updateAssistantMessage(data, String(event.data.turnId), (message) =>
        upsertPart(ensureStepStartPart(message, Number(event.data.stepIndex ?? 0)), nextPart),
      );
    }

    case "message.appended":
      return updateAssistantMessage(data, String(event.data.turnId), (message) =>
        upsertPart(ensureStepStartPart(message, Number(event.data.stepIndex ?? 0)), {
          state: "streaming",
          stepIndex: Number(event.data.stepIndex ?? 0),
          text: String(event.data.messageSoFar ?? ""),
          type: "text",
        }),
      );

    case "message.completed":
      return updateAssistantMessage(data, String(event.data.turnId), (message) => {
        if (event.data.message === null) {
          const stepIndex = Number(event.data.stepIndex ?? 0);
          return completeExistingTextPart(message, stepIndex);
        }
        return upsertPart(ensureStepStartPart(message, Number(event.data.stepIndex ?? 0)), {
          state: "done",
          stepIndex: Number(event.data.stepIndex ?? 0),
          text: String(event.data.message ?? ""),
          type: "text",
        });
      });

    case "result.completed":
      return updateAssistantMetadata(data, String(event.data.turnId), {
        result: event.data.result,
      });

    case "turn.completed":
      return updateAssistantMetadata(data, String(event.data.turnId), { status: "complete" });

    case "turn.failed":
    case "session.failed":
      return data;

    default:
      return data;
  }
}

function respondToInputRequest(data: EveMessageData, response: InputResponse): EveMessageData {
  const existing = findToolPartByApprovalId(data, response.requestId);
  if (!existing) return data;

  const approval: { id: string; reason?: string } = { id: response.requestId };
  if (response.text !== undefined) approval.reason = response.text;

  return updateToolPart(data, existing.toolCallId, {
    approval,
    input: existing.input,
    state: "approval-responded",
    stepIndex: existing.stepIndex,
    toolCallId: existing.toolCallId,
    toolMetadata: mergeToolMetadata(existing.toolMetadata, {
      eve: {
        inputResponse: response,
        kind: existing.toolMetadata?.eve?.kind ?? "unknown",
        name: existing.toolMetadata?.eve?.name ?? existing.toolName,
      },
    }),
    toolName: existing.toolName,
    type: "dynamic-tool",
  });
}

function updateAssistantMessage(
  data: EveMessageData,
  turnId: string,
  update: (message: EveAssistantMessage) => EveAssistantMessage,
): EveMessageData {
  const existing = data.messages.find(
    (message): message is EveAssistantMessage =>
      message.role === "assistant" && message.metadata?.turnId === turnId,
  );
  const message = existing ?? createAssistantMessage(turnId);
  return upsertMessage(data, update(message));
}

function updateAssistantMetadata(
  data: EveMessageData,
  turnId: string,
  metadata: EveMessageMetadata,
): EveMessageData {
  return updateAssistantMessage(data, turnId, (message) => ({
    ...message,
    metadata: { ...message.metadata, ...metadata },
  }));
}

function createAssistantMessage(turnId: string): EveAssistantMessage {
  return {
    id: `${turnId}:assistant`,
    metadata: { status: "streaming", turnId },
    parts: [],
    role: "assistant",
  };
}

function ensureStepStartPart(message: EveAssistantMessage, stepIndex: number): EveAssistantMessage {
  const stepStartCount = message.parts.filter((part) => part.type === "step-start").length;
  if (stepStartCount > stepIndex) return message;

  const missingCount = stepIndex - stepStartCount + 1;
  return {
    ...message,
    parts: [
      ...message.parts,
      ...Array.from({ length: missingCount }, () => ({ type: "step-start" as const })),
    ],
  };
}

function upsertPart(message: EveAssistantMessage, next: EveMessagePart): EveAssistantMessage {
  const index = message.parts.findIndex((part) => partKey(part) === partKey(next));
  const parts =
    index === -1
      ? [...message.parts, next]
      : [...message.parts.slice(0, index), next, ...message.parts.slice(index + 1)];

  return {
    ...message,
    metadata: {
      ...message.metadata,
      status: next.type === "text" && next.state === "done" ? "complete" : "streaming",
    },
    parts,
  };
}

function completeExistingTextPart(message: EveAssistantMessage, stepIndex: number): EveAssistantMessage {
  const index = findLastIndex(message.parts, (part) => part.type === "text" && part.stepIndex === stepIndex);
  if (index === -1) {
    const fallbackIndex = findLastIndex(message.parts, (part) => part.type === "text");
    if (fallbackIndex === -1) return message;
    const fallback = message.parts[fallbackIndex];
    if (fallback?.type !== "text") return message;
    return {
      ...message,
      metadata: { ...message.metadata, status: "complete" },
      parts: [
        ...message.parts.slice(0, fallbackIndex),
        { ...fallback, state: "done" },
        ...message.parts.slice(fallbackIndex + 1),
      ],
    };
  }

  const existing = message.parts[index];
  if (existing?.type !== "text") return message;

  return {
    ...message,
    metadata: { ...message.metadata, status: "complete" },
    parts: [
      ...message.parts.slice(0, index),
      { ...existing, state: "done" },
      ...message.parts.slice(index + 1),
    ],
  };
}

function updateToolPart(data: EveMessageData, toolCallId: string, next: EveDynamicToolPart): EveMessageData {
  const message = data.messages.find(
    (candidate): candidate is EveAssistantMessage =>
      candidate.role === "assistant" &&
      candidate.parts.some((part) => part.type === "dynamic-tool" && part.toolCallId === toolCallId),
  );
  if (!message) return data;
  return upsertMessage(data, upsertPart(message, next));
}

function findToolPart(data: EveMessageData, toolCallId: string): EveDynamicToolPart | undefined {
  for (const message of data.messages) {
    for (const part of message.parts) {
      if (part.type === "dynamic-tool" && part.toolCallId === toolCallId) return part;
    }
  }
  return undefined;
}

function findToolPartByApprovalId(data: EveMessageData, approvalId: string): EveDynamicToolPart | undefined {
  for (const message of data.messages) {
    for (const part of message.parts) {
      if (part.type === "dynamic-tool" && part.approval?.id === approvalId) return part;
    }
  }
  return undefined;
}

function partKey(part: EveMessagePart): string {
  switch (part.type) {
    case "text":
      return `text:${part.stepIndex ?? 0}`;
    case "reasoning":
      return `reasoning:${part.stepIndex ?? 0}`;
    case "step-start":
      return "step-start";
    case "dynamic-tool":
      return `dynamic-tool:${part.toolCallId}`;
  }
}

function upsertMessage(data: EveMessageData, next: EveMessage): EveMessageData {
  const index = data.messages.findIndex((message) => message.id === next.id);
  if (index === -1) return { messages: [...data.messages, next] };
  return { messages: [...data.messages.slice(0, index), next, ...data.messages.slice(index + 1)] };
}

function toMessageInputRequest(request: Record<string, unknown>): EveMessageInputRequest {
  return {
    allowFreeform: request.allowFreeform as boolean | undefined,
    display: request.display as string | undefined,
    options: request.options as EveMessageInputRequest["options"],
    prompt: request.prompt as string | undefined,
    requestId: String(request.requestId ?? ""),
  };
}

function createToolMetadata(
  descriptor: ActionDescriptor,
  extra?: { readonly inputRequest?: EveMessageInputRequest },
): EveMessageToolMetadata {
  return {
    eve: {
      inputRequest: extra?.inputRequest,
      kind: descriptor.kind,
      name: descriptor.name,
    },
  };
}

function mergeToolMetadata(
  current: EveMessageToolMetadata | undefined,
  next: EveMessageToolMetadata,
): EveMessageToolMetadata {
  const kind = next.eve?.kind ?? current?.eve?.kind ?? "unknown";
  const name = next.eve?.name ?? current?.eve?.name ?? "unknown";
  return {
    eve: {
      ...current?.eve,
      ...next.eve,
      inputRequest: next.eve?.inputRequest ?? current?.eve?.inputRequest,
      inputResponse: next.eve?.inputResponse ?? current?.eve?.inputResponse,
      kind,
      name,
    },
  };
}

function approvedApproval(part: EveDynamicToolPart | undefined):
  | { readonly id: string; readonly approved: true; readonly reason?: string; readonly isAutomatic?: boolean }
  | undefined {
  if (!part?.approval?.id) return undefined;
  return {
    approved: true,
    id: part.approval.id,
    isAutomatic: part.approval.isAutomatic,
    reason: part.approval.reason,
  };
}

function normalizeActionRequest(action: Record<string, unknown>): ActionDescriptor {
  switch (action.kind) {
    case "load-skill":
      return { kind: "load-skill", name: "load_skill", toolName: "eve:load-skill" };
    case "tool-call":
      return { kind: "tool-call", name: String(action.toolName ?? ""), toolName: String(action.toolName ?? "") };
    case "subagent-call":
      return {
        kind: "subagent-call",
        name: String(action.subagentName ?? ""),
        toolName: `eve:subagent:${String(action.subagentName ?? "")}`,
      };
    case "remote-agent-call":
      return {
        kind: "subagent-call",
        name: String(action.remoteAgentName ?? ""),
        toolName: `eve:subagent:${String(action.remoteAgentName ?? "")}`,
      };
    default:
      return { kind: "tool-call", name: String(action.toolName ?? ""), toolName: String(action.toolName ?? "") };
  }
}

function normalizeActionResult(result: Record<string, unknown>): ActionDescriptor {
  switch (result.kind) {
    case "load-skill-result":
      return { kind: "load-skill", name: String(result.name ?? "load_skill"), toolName: "eve:load-skill" };
    case "tool-result":
      return { kind: "tool-call", name: String(result.toolName ?? ""), toolName: String(result.toolName ?? "") };
    case "subagent-result":
      return {
        kind: "subagent-call",
        name: String(result.subagentName ?? ""),
        toolName: `eve:subagent:${String(result.subagentName ?? "")}`,
      };
    default:
      return { kind: "tool-call", name: String(result.toolName ?? ""), toolName: String(result.toolName ?? "") };
  }
}

function optimisticUserMessageId(submissionId: string): string {
  return `optimistic:${submissionId}:user`;
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return "Action failed.";
  }
}

function findLastIndex<T>(items: readonly T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index] as T)) return index;
  }
  return -1;
}