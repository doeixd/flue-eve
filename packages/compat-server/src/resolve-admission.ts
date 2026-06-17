import { createLoopbackAdmission } from "./admission/loopback.js";
import type { FlueAdmissionAdapter } from "./types.js";

export interface ResolveAdmissionOptions {
  readonly agentName: string;
  /** Explicit in-process adapter (from `createInProcessAdmission` or runtime hooks). */
  readonly inProcess?: FlueAdmissionAdapter;
  /** When true, skip in-process even if provided or auto-detected. */
  readonly preferLoopback?: boolean;
  readonly flueBaseUrl?: string;
  readonly flueMount?: string;
}

/**
 * Resolve admission for integrated Flue apps.
 *
 * Preference order (M8a):
 * 1. In-process when `inProcess` is provided (and `preferLoopback` is not set)
 * 2. HTTP loopback when `FLUE_BASE_URL`, `FLUE_AGENT_URL`, or `flueBaseUrl` is set
 * 3. `undefined` — `eveCompat` falls back to mock admission
 */
export function resolveAdmission(options: ResolveAdmissionOptions): FlueAdmissionAdapter | undefined {
  if (options.inProcess !== undefined && options.preferLoopback !== true) {
    return options.inProcess;
  }

  const baseUrl =
    options.flueBaseUrl?.trim() ??
    process.env.FLUE_BASE_URL?.trim() ??
    process.env.FLUE_AGENT_URL?.trim();
  if (!baseUrl) return undefined;

  return createLoopbackAdmission({
    agentName: options.agentName,
    baseUrl,
    flueMount: options.flueMount,
  });
}