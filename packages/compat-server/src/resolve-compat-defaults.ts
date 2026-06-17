import { resolveJournalPersistence } from "./journal-persistence.js";
import { resolveEveProductionOptions } from "./resolve-production.js";
import type { EveCompatOptions } from "./types.js";

/** Production defaults for Flue sidecar mounts (`auth` + `persistence` from env). */
export function resolveEveCompatDefaults(): Pick<EveCompatOptions, "auth" | "persistence"> {
  return {
    auth: resolveEveProductionOptions().auth,
    persistence: resolveJournalPersistence(),
  };
}