import type { FlueEvent } from "@flue-eve/shared";

import type { AdmitTurnInput, FlueAdmissionAdapter } from "../types.js";

const HITL_TRIGGER = "__hitl__";

/** Deterministic two-turn HITL fixture: parks on approval, resumes on inputResponses. */
export function createHitlMockAdmission(): FlueAdmissionAdapter {
  return {
    async *admitTurn(input: AdmitTurnInput): AsyncIterable<FlueEvent> {
      const responses = input.inputResponses ?? [];
      if (responses.length > 0) {
        const denied = responses.some((response) => response.optionId === "deny");
        if (denied) {
          yield {
            type: "tool_rejected",
            toolCallId: "call_1",
            toolName: "bash",
            reason: "Denied by user",
          };
        } else {
          yield {
            type: "tool",
            toolCallId: "call_1",
            toolName: "bash",
            result: "ok",
            isError: false,
            durationMs: 1,
          };
          yield { type: "text_delta", text: "Done." };
        }
        yield { type: "idle" };
        return;
      }

      if (!input.message.includes(HITL_TRIGGER)) {
        yield { type: "text_delta", text: `Reply: ${input.message}` };
        yield { type: "idle" };
        return;
      }

      yield {
        type: "tool_start",
        toolCallId: "call_1",
        toolName: "bash",
        args: { command: "pwd" },
      };
      yield {
        type: "hitl_requested",
        requests: [
          {
            requestId: "approval_1",
            action: {
              kind: "tool-call",
              callId: "call_1",
              toolName: "bash",
              input: { command: "pwd" },
            },
            display: "confirmation",
            options: [
              { id: "approve", label: "Yes", style: "primary" },
              { id: "deny", label: "No", style: "danger" },
            ],
            prompt: "Approve tool call: bash",
          },
        ],
      };
      yield { type: "idle" };
    },
  };
}