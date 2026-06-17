import type { FlueAgentSendResult, FlueEvent } from "@flue-eve/shared";

import { consumeFlueAgentStream } from "../flue-stream.js";
import type { AdmitTurnInput, FlueAdmissionAdapter } from "../types.js";

export interface LoopbackAdmissionOptions {
  readonly baseUrl: string;
  readonly agentName: string;
  readonly flueMount?: string;
  readonly fetch?: typeof globalThis.fetch;
}

/**
 * HTTP loopback admission — POST + Durable Streams read per Flue SDK contract.
 * Dev/prod Node when in-process admission is unavailable.
 */
export function createLoopbackAdmission(options: LoopbackAdmissionOptions): FlueAdmissionAdapter {
  const mount = normalizeMount(options.flueMount ?? "/");
  const fetch = options.fetch ?? globalThis.fetch;

  return {
    async *admitTurn(input: AdmitTurnInput): AsyncIterable<FlueEvent> {
      const streamPath = `${mount}/agents/${encodeURIComponent(input.agentName)}/${encodeURIComponent(input.sessionId)}`;
      const admitUrl = new URL(streamPath, options.baseUrl);

      const body: Record<string, unknown> = { message: input.message };
      if (input.inputResponses !== undefined && input.inputResponses.length > 0) {
        body.inputResponses = input.inputResponses;
      }
      if (input.outputSchema !== undefined) body.outputSchema = input.outputSchema;
      if (input.clientContext !== undefined) body.clientContext = input.clientContext;

      const admitResponse = await postWithRetry(fetch, admitUrl, JSON.stringify(body));

      if (!admitResponse.ok) {
        yield {
          type: "error",
          message: `Admission returned ${admitResponse.status}`,
          code: "admission_failed",
        };
        return;
      }

      const envelope = (await admitResponse.json()) as FlueAgentSendResult;
      const streamUrl = envelope.streamUrl ?? admitUrl.toString();
      const offset = envelope.offset ?? "-1";

      yield* consumeFlueAgentStream({
        url: streamUrl,
        offset,
        submissionId: envelope.submissionId,
        fetch,
      });
    },
  };
}

function normalizeMount(mount: string): string {
  if (mount === "/" || mount === "") return "";
  const trimmed = mount.endsWith("/") ? mount.slice(0, -1) : mount;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

async function postWithRetry(
  fetchImpl: typeof globalThis.fetch,
  url: URL,
  body: string,
  retries = 2,
): Promise<Response> {
  let lastResponse: Response | undefined;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });

    if (response.ok) return response;
    lastResponse = response;

    if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
      return response;
    }

    if (attempt < retries) {
      await sleep(200 * (attempt + 1));
    }
  }

  return lastResponse!;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}