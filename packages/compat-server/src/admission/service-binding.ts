import type { FlueAdmissionAdapter } from "../types.js";

import { createLoopbackAdmission } from "./loopback.js";

export interface ServiceBindingFetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export interface ServiceBindingAdmissionOptions {
  readonly binding: ServiceBindingFetcher;
  readonly agentName: string;
  readonly flueMount?: string;
}

const BINDING_ORIGIN = "https://flue.internal";

/**
 * Cloudflare Service Binding admission — HTTP-equivalent loopback via `Fetcher`
 * (Worker A → Worker B) when in-process Flue runtime is unavailable.
 */
export function createServiceBindingAdmission(
  options: ServiceBindingAdmissionOptions,
): FlueAdmissionAdapter {
  return createLoopbackAdmission({
    agentName: options.agentName,
    baseUrl: BINDING_ORIGIN,
    flueMount: options.flueMount,
    fetch: (input, init) => {
      const href =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const { pathname, search } = new URL(href);
      return options.binding.fetch(`${BINDING_ORIGIN}${pathname}${search}`, init);
    },
  });
}