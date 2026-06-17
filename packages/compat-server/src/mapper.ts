import {
  createActionResultEvent,
  createActionsRequestedEvent,
  createAuthorizationCompletedEvent,
  createAuthorizationRequiredEvent,
  createInputRequestedEvent,
  createMessageAppendedEvent,
  createMessageCompletedEvent,
  createMessageReceivedEvent,
  createResultCompletedEvent,
  createSessionFailedEvent,
  createSessionStartedEvent,
  createSessionWaitingEvent,
  createTurnCompletedEvent,
  createTurnStartedEvent,
  flueToolNameToEve,
  type EveEvent,
  type FlueEvent,
  type FlueAuthorizationCompletedEvent,
  type FlueAuthorizationRequiredEvent,
  type FlueHitlRequestedEvent,
} from "@flue-eve/shared";

import { inferMcpAuthorizationRequired } from "./mcp-auth.js";
import type { InputResponse } from "./session-body.js";
import { createTurnId } from "./tokens.js";

export interface MapContext {
  readonly sessionId: string;
  readonly turnId: string;
  readonly userMessage: string;
  readonly isFirstTurn: boolean;
  readonly inputResponses?: readonly InputResponse[];
}

export async function* mapFlueToEve(
  flueEvents: AsyncIterable<FlueEvent>,
  ctx: MapContext,
): AsyncGenerator<EveEvent> {
  let sequence = 0;
  const stepIndex = 0;
  let text = "";
  let activeTurnId = ctx.turnId;
  let sawAssistantText = false;
  let parkedOnAuthorization = false;

  if (ctx.isFirstTurn) {
    yield createSessionStartedEvent();
  }

  yield createTurnStartedEvent({ turnId: activeTurnId, sequence });
  sequence += 1;

  if (ctx.userMessage.length > 0) {
    yield createMessageReceivedEvent({
      message: ctx.userMessage,
      turnId: activeTurnId,
      sequence,
    });
    sequence += 1;
  }

  yield { type: "step.started", data: { turnId: activeTurnId, sequence, stepIndex } };
  sequence += 1;

  for await (const raw of flueEvents) {
    const event = normalizeLegacyFlueEvent(raw);

    if (typeof event.turnId === "string" && event.turnId.length > 0) {
      activeTurnId = event.turnId;
    }

    switch (event.type) {
      case "text_delta":
      case "text-delta": {
        const delta =
          event.type === "text_delta"
            ? (typeof event.text === "string" ? event.text : "")
            : (typeof event.delta === "string" ? event.delta : "");
        text += delta;
        sawAssistantText = text.length > 0;
        yield createMessageAppendedEvent({
          messageDelta: delta,
          messageSoFar: text,
          turnId: activeTurnId,
          sequence,
          stepIndex,
        });
        sequence += 1;
        break;
      }
      case "text-done": {
        if (typeof event.text === "string") {
          text = event.text;
          sawAssistantText = true;
          yield createMessageCompletedEvent({
            message: text,
            turnId: activeTurnId,
            sequence,
            stepIndex,
          });
          sequence += 1;
        }
        break;
      }
      case "tool_start":
      case "tool-call": {
        const toolName = String(event.toolName ?? "tool");
        const callId = String(event.toolCallId ?? `call_${sequence}`);
        const input = "args" in event ? event.args : "input" in event ? event.input : {};
        yield createActionsRequestedEvent({
          actions: [
            {
              kind: "tool-call",
              callId,
              toolName: flueToolNameToEve(toolName),
              input: input ?? {},
            },
          ],
          turnId: activeTurnId,
          sequence,
          stepIndex,
        });
        sequence += 1;
        break;
      }
      case "tool":
      case "tool-result": {
        const toolName = String(event.toolName ?? "tool");
        const callId = String(event.toolCallId ?? `call_${sequence}`);
        const isError = Boolean(event.isError);
        const output = "result" in event ? event.result : {};

        const authRequired = inferMcpAuthorizationRequired({
          toolName,
          isError,
          output: output ?? null,
        });
        if (authRequired !== undefined) {
          yield createAuthorizationRequiredEvent({
            name: authRequired.name,
            description: authRequired.description,
            authorization: authRequired.authorization,
            webhookUrl: authRequired.webhookUrl,
            turnId: activeTurnId,
            sequence,
            stepIndex,
          });
          sequence += 1;
          parkedOnAuthorization = true;
          break;
        }

        yield createActionResultEvent({
          result: {
            callId,
            kind: "tool-result",
            toolName: flueToolNameToEve(toolName),
            output: output ?? null,
            isError,
          },
          turnId: activeTurnId,
          sequence,
          stepIndex,
        });
        sequence += 1;
        break;
      }
      case "tool_rejected": {
        const toolName = String(event.toolName ?? "tool");
        const callId = String(event.toolCallId ?? `call_${sequence}`);
        yield createActionResultEvent({
          rejected: true,
          result: {
            callId,
            kind: "tool-result",
            toolName: flueToolNameToEve(toolName),
            output: {
              code: "TOOL_DENIED",
              message: String(event.reason ?? "Denied"),
            },
          },
          turnId: activeTurnId,
          sequence,
          stepIndex,
        });
        sequence += 1;
        break;
      }
      case "hitl_requested": {
        const hitl = event as FlueHitlRequestedEvent;
        const requests = normalizeHitlRequests(hitl.requests);
        yield createInputRequestedEvent({
          requests,
          turnId: activeTurnId,
          sequence,
          stepIndex,
        });
        sequence += 1;
        break;
      }
      case "authorization_required": {
        const auth = event as FlueAuthorizationRequiredEvent;
        yield createAuthorizationRequiredEvent({
          name: auth.name,
          description: auth.description,
          authorization: auth.authorization,
          webhookUrl: auth.webhookUrl,
          turnId: activeTurnId,
          sequence,
          stepIndex,
        });
        sequence += 1;
        parkedOnAuthorization = true;
        break;
      }
      case "authorization_completed": {
        const auth = event as FlueAuthorizationCompletedEvent;
        yield createAuthorizationCompletedEvent({
          name: auth.name,
          outcome: auth.outcome,
          reason: auth.reason,
          authorization: auth.authorization,
          turnId: activeTurnId,
          sequence,
          stepIndex,
        });
        sequence += 1;
        break;
      }
      case "result_completed": {
        yield createResultCompletedEvent({
          result: event.result,
          turnId: activeTurnId,
          sequence,
          stepIndex,
        });
        sequence += 1;
        break;
      }
      case "thinking_delta": {
        yield {
          type: "reasoning.appended",
          data: {
            delta: String(event.delta ?? ""),
            reasoningSoFar: String(event.delta ?? ""),
            turnId: activeTurnId,
            sequence,
            stepIndex,
          },
        };
        sequence += 1;
        break;
      }
      case "error": {
        yield createSessionFailedEvent({
          code: String(event.code ?? "error"),
          message: String(event.message ?? "Unknown error"),
          sessionId: ctx.sessionId,
        });
        return;
      }
      case "idle":
      case "submission_settled":
      case "submission-settled":
        break;
      default:
        break;
    }
  }

  if (sawAssistantText && text.length > 0) {
    yield createMessageCompletedEvent({
      message: text,
      turnId: activeTurnId,
      sequence,
      stepIndex,
    });
    sequence += 1;
  }

  yield { type: "step.completed", data: { turnId: activeTurnId, sequence, stepIndex } };
  sequence += 1;
  yield createTurnCompletedEvent({ turnId: activeTurnId, sequence });
  if (parkedOnAuthorization) return;
  yield createSessionWaitingEvent();
}

export function createMapContext(input: {
  sessionId: string;
  userMessage: string;
  isFirstTurn: boolean;
  inputResponses?: readonly InputResponse[];
}): MapContext {
  return {
    sessionId: input.sessionId,
    turnId: createTurnId(),
    userMessage: input.userMessage,
    isFirstTurn: input.isFirstTurn,
    inputResponses: input.inputResponses,
  };
}

function normalizeHitlRequests(
  requests: readonly Record<string, unknown>[],
): readonly Record<string, unknown>[] {
  return requests.map((request) => {
    const action = request.action;
    if (action === null || typeof action !== "object") return request;
    const actionRecord = action as Record<string, unknown>;
    if (typeof actionRecord.toolName !== "string") return request;
    return {
      ...request,
      action: {
        ...actionRecord,
        toolName: flueToolNameToEve(actionRecord.toolName),
      },
    };
  });
}

function normalizeLegacyFlueEvent(event: FlueEvent): FlueEvent & Record<string, unknown> {
  return event as FlueEvent & Record<string, unknown>;
}