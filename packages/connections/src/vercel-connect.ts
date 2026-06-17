import type { FlueConnectionDefinition, FlueConnectionMcpConfig } from "./types.js";

/** Opaque Vercel Connect auth spec (from `@vercel/connect/eve` when installed). */
export type VercelConnectAuthSpec = string | ConnectAuthorizationProvider;

export interface ConnectEveModule {
  readonly connect: (spec: VercelConnectAuthSpec) => ConnectAuthorizationProvider;
}

export interface ResolveConnectOptions {
  readonly loader?: () => Promise<ConnectEveModule>;
}

export interface ConnectAuthorizationProvider {
  readonly getToken?: (input: ConnectGetTokenInput) => Promise<ConnectTokenResult>;
  readonly vercelConnect?: { readonly connector: string };
}

export interface ConnectGetTokenInput {
  readonly connection: { readonly name: string; readonly url: string };
  readonly principal: { readonly type: "app" | "user" };
}

export interface ConnectTokenResult {
  readonly token: string;
  readonly expiresAt?: number;
}

export interface FlueConnectionWithConnectDefinition extends FlueConnectionDefinition {
  readonly auth?: VercelConnectAuthSpec;
}

/**
 * Marks a connection for optional Vercel Connect OAuth bridging.
 * Runtime token injection and `authorization.*` stream events are handled by compat-server (M5+).
 */
export function defineFlueConnectionWithConnect(
  definition: FlueConnectionWithConnectDefinition,
): FlueConnectionWithConnectDefinition {
  return definition;
}

let connectModulePromise: Promise<ConnectEveModule | undefined> | undefined;

/** Reset cached `@vercel/connect/eve` import (tests only). */
export function resetConnectModuleCache(): void {
  connectModulePromise = undefined;
}

async function loadConnectEveModule(
  loader: () => Promise<ConnectEveModule> = () =>
    import("@vercel/connect/eve") as Promise<ConnectEveModule>,
): Promise<ConnectEveModule | undefined> {
  if (connectModulePromise === undefined) {
    connectModulePromise = loader().catch(() => undefined);
  }
  return connectModulePromise;
}

/** Resolve a Connect auth provider from an object or `connect("oauth/…")` string spec. */
export async function resolveConnectProvider(
  auth: VercelConnectAuthSpec,
  options: ResolveConnectOptions = {},
): Promise<ConnectAuthorizationProvider | undefined> {
  const direct = normalizeConnectAuth(auth);
  if (direct !== undefined) return direct;

  if (typeof auth !== "string" || auth.length === 0) return undefined;

  const mod = await loadConnectEveModule(options.loader);
  if (mod?.connect === undefined) return undefined;

  return normalizeConnectAuth(mod.connect(auth));
}

/** Map Connect/Eve-style auth providers to Flue MCP request headers. */
export async function resolveConnectMcpHeaders(
  input: {
    readonly auth: VercelConnectAuthSpec;
    readonly mcp: FlueConnectionMcpConfig;
    readonly connectionName: string;
  },
  options: ResolveConnectOptions = {},
): Promise<HeadersInit | undefined> {
  const provider = await resolveConnectProvider(input.auth, options);
  if (provider?.getToken === undefined) return undefined;

  try {
    const result = await provider.getToken({
      connection: { name: input.connectionName, url: input.mcp.url },
      principal: { type: "app" },
    });

    if (typeof result.token !== "string" || result.token.length === 0) {
      return undefined;
    }

    return { Authorization: `Bearer ${result.token}` };
  } catch {
    // OAuth required — compat-server parks via authorization.required (no bearer yet).
    return undefined;
  }
}

function normalizeConnectAuth(auth: VercelConnectAuthSpec): ConnectAuthorizationProvider | undefined {
  if (typeof auth === "string") return undefined;
  if (auth === null || typeof auth !== "object") return undefined;
  if (typeof auth.getToken !== "function") return undefined;
  return auth;
}

export function mergeMcpHeaders(
  base: HeadersInit | undefined,
  extra: HeadersInit | undefined,
): HeadersInit | undefined {
  if (extra === undefined) return base;
  if (base === undefined) return extra;

  const merged = new Headers(base);
  const overlay = new Headers(extra);
  overlay.forEach((value, key) => {
    merged.set(key, value);
  });
  return merged;
}