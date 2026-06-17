import { Hono } from "hono";

import { createInProcessAdmission } from "./admission/in-process.js";
import { createMockAdmission } from "./admission/mock.js";
import { createServiceBindingAdmission } from "./admission/service-binding.js";
import { createEveCompatApp } from "./eve-compat.js";
import {
  createCloudflareKvJournalPersistence,
  type CloudflareKvNamespace,
} from "./journal-persistence-cloudflare.js";
import {
  createDurableObjectJournalRpcPersistence,
  type DurableObjectJournalStub,
} from "./journal-persistence-do-rpc.js";
import type { ServiceBindingFetcher } from "./admission/service-binding.js";
import type { EveCompatOptions, FlueAdmissionAdapter } from "./types.js";

export interface DurableObjectNamespaceBinding {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectJournalStub;
}

export interface DurableObjectId {
  toString(): string;
}

/** Cloudflare Worker bindings for Eve compat (KV/DO journal + optional bearer auth). */
export interface EveWorkerBindings {
  readonly SESSIONS_KV?: CloudflareKvNamespace;
  readonly EVE_JOURNAL_DO?: DurableObjectNamespaceBinding;
  readonly EVE_AUTH_BEARER?: string;
  readonly EVE_AGENT_NAME?: string;
  /** Service Binding to a Flue agent Worker (M8a). */
  readonly FLUE_AGENT?: ServiceBindingFetcher;
}

export type EveWorkerOptions = Omit<EveCompatOptions, "persistence" | "auth" | "agentName"> & {
  readonly agentName?: string;
};

/**
 * Resolve admission for a Cloudflare Worker context.
 *
 * Preference order:
 *   1. In-process (co-located Flue runtime) via `getFlueRuntime()` from `@flue/runtime/internal`
 *   2. Service Binding via `FLUE_AGENT` binding
 *   3. `undefined` — caller falls back to mock
 */
export async function resolveWorkerAdmission(
  agentName: string,
  bindings: EveWorkerBindings,
): Promise<FlueAdmissionAdapter | undefined> {
  try {
    const mod = await import("@flue/runtime/internal") as {
      getFlueRuntime?: () => {
        createAdmission?: Record<string, unknown>;
        eventStreamStore?: unknown;
      };
    };
    const runtime = mod.getFlueRuntime?.();
    if (runtime?.createAdmission && runtime?.eventStreamStore) {
      return createInProcessAdmission({
        agentName,
        hooks: {
          createAdmission: runtime.createAdmission as Record<string, (instanceId: string) => (payload: unknown) => Promise<{ submissionId: string }>>,
          eventStreamStore: runtime.eventStreamStore as {
            getStreamMeta(path: string): Promise<{ nextOffset: string; closed: boolean }>;
            readEvents(path: string, opts?: { offset?: string; limit?: number }): Promise<{
              events: Array<{ data: unknown; offset: string }>;
              nextOffset: string;
              upToDate: boolean;
              closed: boolean;
            }>;
          },
        },
      });
    }
  } catch {
    // @flue/runtime not available in this Worker — fall through
  }

  if (bindings.FLUE_AGENT !== undefined) {
    return createServiceBindingAdmission({ binding: bindings.FLUE_AGENT, agentName });
  }

  return undefined;
}

/**
 * Eve `/eve/v1` app for Cloudflare Workers.
 * Uses KV-backed journal persistence when `SESSIONS_KV` is bound; mock admission by default
 * (use `resolveWorkerAdmission()` for in-process or Service Binding admission).
 */
export function createEveWorkerApp(
  bindings: EveWorkerBindings,
  options: EveWorkerOptions = {},
): Hono {
  const persistence = resolveWorkerPersistence(bindings);

  const auth =
    bindings.EVE_AUTH_BEARER !== undefined && bindings.EVE_AUTH_BEARER.length > 0
      ? { bearer: bindings.EVE_AUTH_BEARER }
      : "none";

  const agentName = bindings.EVE_AGENT_NAME ?? options.agentName ?? "assistant";

  const { agentName: _ignoredAgentName, admission: explicitAdmission, ...rest } = options;

  return createEveCompatApp({
    ...rest,
    agentName,
    admission:
      explicitAdmission ??
      (bindings.FLUE_AGENT !== undefined
        ? createServiceBindingAdmission({ binding: bindings.FLUE_AGENT, agentName })
        : createMockAdmission()),
    persistence,
    auth,
  });
}

function resolveWorkerPersistence(bindings: EveWorkerBindings) {
  if (bindings.EVE_JOURNAL_DO !== undefined) {
    const id = bindings.EVE_JOURNAL_DO.idFromName("sessions");
    return createDurableObjectJournalRpcPersistence(bindings.EVE_JOURNAL_DO.get(id));
  }
  if (bindings.SESSIONS_KV !== undefined) {
    return createCloudflareKvJournalPersistence(bindings.SESSIONS_KV);
  }
  return undefined;
}

export {
  createCloudflareKvJournalPersistence,
  createCloudflareKvJournalStore,
  createDurableObjectJournalPersistence,
  type CloudflareDurableObjectStorage,
  type CloudflareKvNamespace,
} from "./journal-persistence-cloudflare.js";
export {
  createDurableObjectJournalRpcPersistence,
  type DurableObjectJournalStub,
} from "./journal-persistence-do-rpc.js";