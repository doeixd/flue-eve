import { createRequire } from "node:module";

import {
  createInProcessAdmission,
  type InProcessAdmissionHooks,
} from "./admission/in-process.js";
import { resolveAdmission } from "./resolve-admission.js";
import type { FlueAdmissionAdapter } from "./types.js";

const _require = createRequire(import.meta.url);

export interface ResolveAdmissionFromRuntimeOptions {
  readonly flueBaseUrl?: string;
  readonly preferLoopback?: boolean;
}

let probeCache: InProcessAdmissionHooks | undefined | false = undefined;

function probeRuntime(): InProcessAdmissionHooks | undefined {
  if (probeCache !== undefined) {
    return probeCache || undefined;
  }

  try {
    const mod = _require("@flue/runtime/internal") as {
      getFlueRuntime?: () => {
        createAdmission?: Record<string, unknown>;
        eventStreamStore?: unknown;
      };
    };
    const runtime = mod.getFlueRuntime?.();
    if (!runtime) {
      probeCache = false;
      return undefined;
    }

    const { createAdmission, eventStreamStore } = runtime;
    if (createAdmission && eventStreamStore) {
      const hooks: InProcessAdmissionHooks = {
        createAdmission: createAdmission as InProcessAdmissionHooks["createAdmission"],
        eventStreamStore: eventStreamStore as InProcessAdmissionHooks["eventStreamStore"],
      };
      probeCache = hooks;
      return hooks;
    }

    probeCache = false;
    return undefined;
  } catch {
    probeCache = false;
    return undefined;
  }
}

export function resolveAdmissionFromRuntime(
  agentName: string,
  opts?: ResolveAdmissionFromRuntimeOptions,
): FlueAdmissionAdapter | undefined {
  const hooks = probeRuntime();

  return resolveAdmission({
    agentName,
    inProcess:
      hooks !== undefined
        ? createInProcessAdmission({ agentName, hooks })
        : undefined,
    flueBaseUrl: opts?.flueBaseUrl ?? process.env.FLUE_BASE_URL,
    preferLoopback: opts?.preferLoopback,
  });
}

export function clearProbeCache(): void {
  probeCache = undefined;
}
