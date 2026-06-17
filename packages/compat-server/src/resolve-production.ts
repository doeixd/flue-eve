import { resolveAuthPolicy } from "./auth.js";
import type { EveAuthPolicy } from "./types.js";

export interface EveProductionOptions {
  readonly auth: EveAuthPolicy;
}

/**
 * Resolve production-safe Eve auth for Node / Flue sidecar deploys.
 * - `EVE_AUTH_BEARER` set → bearer auth
 * - `NODE_ENV=production` without bearer → fail-closed bearer (no token matches)
 * - otherwise → `local-dev` (open routes)
 */
export function resolveEveProductionOptions(
  nodeEnv = process.env.NODE_ENV,
): EveProductionOptions {
  const bearer = process.env.EVE_AUTH_BEARER?.trim();
  if (bearer !== undefined && bearer.length > 0) {
    return { auth: { bearer } };
  }
  if (nodeEnv === "production") {
    // Empty bearer object → resolveAuthPolicy fail-closed (401 on all session routes).
    return { auth: {} };
  }
  return { auth: "local-dev" };
}

/** True when routes require a valid bearer token. */
export function isEveAuthEnforced(
  auth: EveAuthPolicy,
  nodeEnv = process.env.NODE_ENV,
): boolean {
  return resolveAuthPolicy(auth, nodeEnv).mode === "bearer";
}