import type { FlueEvent } from "@flue-eve/shared";

import type { AdmitTurnInput, FlueAdmissionAdapter } from "../types.js";

/** Simulates a successful Linear MCP tool call (static token path). */
export function createLinearMcpSuccessAdmission(): FlueAdmissionAdapter {
  return {
    async *admitTurn(input: AdmitTurnInput): AsyncIterable<FlueEvent> {
      yield {
        type: "tool_start",
        toolCallId: "call_linear_1",
        toolName: "mcp__linear__list_issues",
        args: { limit: 5 },
      };
      yield {
        type: "tool",
        toolCallId: "call_linear_1",
        toolName: "mcp__linear__list_issues",
        result: [{ id: "issue_1", title: "Example issue" }],
        isError: false,
        durationMs: 12,
      };
      yield { type: "text_delta", text: `Listed issues for: ${input.message}` };
      yield { type: "idle" };
    },
  };
}