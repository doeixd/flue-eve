import type { Context, Next } from "hono";

import type { EveAuthPolicy } from "./types.js";

export interface ResolvedAuthPolicy {
  readonly mode: "none" | "local-dev" | "bearer";
  readonly bearerToken?: string;
}

export function resolveAuthPolicy(
  auth: EveAuthPolicy | undefined,
  nodeEnv = process.env.NODE_ENV,
): ResolvedAuthPolicy {
  if (auth === "none") return { mode: "none" };
  if (auth === "local-dev") return { mode: "local-dev" };
  if (typeof auth === "object" && typeof auth.bearer === "string" && auth.bearer.length > 0) {
    return { mode: "bearer", bearerToken: auth.bearer };
  }

  if (nodeEnv === "production") {
    return { mode: "bearer", bearerToken: undefined };
  }

  return { mode: "local-dev" };
}

export function createAuthMiddleware(policy: ResolvedAuthPolicy) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    if (policy.mode === "none" || policy.mode === "local-dev") {
      await next();
      return;
    }

    const header = c.req.header("authorization");
    const token = parseBearerToken(header);
    if (policy.bearerToken === undefined || token !== policy.bearerToken) {
      return c.json({ ok: false, error: "Unauthorized." }, 401);
    }

    await next();
  };
}

function parseBearerToken(header: string | undefined): string | undefined {
  if (header === undefined) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1];
}