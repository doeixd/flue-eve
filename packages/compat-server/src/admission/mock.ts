import type { FlueEvent } from "@flue-eve/shared";

import type { AdmitTurnInput, FlueAdmissionAdapter } from "../types.js";

/** Deterministic Flue-shaped event generator for tests and dev without a live LLM. */
export function createMockAdmission(options?: {
  readonly replyPrefix?: string;
}): FlueAdmissionAdapter {
  const replyPrefix = options?.replyPrefix ?? "Reply: ";

  return {
    async *admitTurn(input: AdmitTurnInput): AsyncIterable<FlueEvent> {
      const reply = `${replyPrefix}${input.message}`;
      const chunkSize = Math.max(1, Math.ceil(reply.length / 3));
      let text = "";

      for (let i = 0; i < reply.length; i += chunkSize) {
        const delta = reply.slice(i, i + chunkSize);
        text += delta;
        yield { type: "text_delta", text: delta };
      }

      if (input.outputSchema !== undefined) {
        yield {
          type: "result_completed",
          result: inferStructuredResult(input.outputSchema, text),
        };
      }

      yield { type: "idle" };
    },
  };
}

function inferStructuredResult(
  schema: Record<string, unknown>,
  text: string,
): Record<string, unknown> {
  const properties = schema.properties;
  if (properties === null || typeof properties !== "object") {
    return { value: text };
  }

  const result: Record<string, unknown> = {};
  for (const key of Object.keys(properties as Record<string, unknown>)) {
    result[key] = text;
  }
  return result;
}