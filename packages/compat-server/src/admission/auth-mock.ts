import type { FlueEvent } from "@flue-eve/shared";

import type { AdmitTurnInput, FlueAdmissionAdapter } from "../types.js";

const OAUTH_TRIGGER = "__oauth__";
const OAUTH_COMPLETE_TRIGGER = "__oauth_complete__";

/** Deterministic OAuth fixture for connections shim tests. */
export function createAuthMockAdmission(): FlueAdmissionAdapter {
  return {
    async *admitTurn(input: AdmitTurnInput): AsyncIterable<FlueEvent> {
      if (input.message.includes(OAUTH_COMPLETE_TRIGGER)) {
        yield {
          type: "authorization_completed",
          name: "linear",
          outcome: "authorized",
          authorization: { displayName: "Linear", url: "https://idp.example.com/oauth" },
        };
        yield { type: "text_delta", text: "Authorized." };
        yield { type: "idle" };
        return;
      }

      if (input.message.includes(OAUTH_TRIGGER)) {
        yield {
          type: "authorization_required",
          name: "linear",
          description: "Linear workspace: issues, projects, cycles.",
          authorization: {
            displayName: "Linear",
            url: "https://idp.example.com/oauth/authorize",
          },
          webhookUrl: "https://app.example.com/eve/v1/connections/linear/callback",
        };
        yield { type: "idle" };
        return;
      }

      yield { type: "text_delta", text: `Reply: ${input.message}` };
      yield { type: "idle" };
    },
  };
}