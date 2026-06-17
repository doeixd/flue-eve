import type { FlueEvent } from "@flue-eve/shared";

import type { AdmitTurnInput, FlueAdmissionAdapter } from "../types.js";

/** Simulates a live Flue MCP tool returning 401 unauthorized. */
export function createMcpAuthFailureAdmission(): FlueAdmissionAdapter {
  return {
    async *admitTurn(input: AdmitTurnInput): AsyncIterable<FlueEvent> {
      yield {
        type: "tool_start",
        toolCallId: "call_1",
        toolName: "mcp__linear__list_issues",
        args: {},
      };
      yield {
        type: "tool",
        toolCallId: "call_1",
        toolName: "mcp__linear__list_issues",
        result: { status: 401, message: "Unauthorized" },
        isError: true,
        durationMs: 1,
      };
      yield { type: "text_delta", text: `Ack: ${input.message}` };
      yield { type: "idle" };
    },
  };
}