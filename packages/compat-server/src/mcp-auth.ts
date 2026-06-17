import type { FlueAuthorizationRequiredEvent } from "@flue-eve/shared";

const MCP_PREFIX = "mcp__";

/** Detect live Flue MCP tool auth failures (401 / unauthorized) for OAuth park. */
export function inferMcpAuthorizationRequired(input: {
  readonly toolName: string;
  readonly isError: boolean;
  readonly output: unknown;
}): FlueAuthorizationRequiredEvent | undefined {
  if (!input.isError || !input.toolName.startsWith(MCP_PREFIX)) return undefined;
  if (!looksLikeAuthFailure(input.output)) return undefined;

  const connectionName = parseMcpConnectionName(input.toolName);
  const challenge = extractAuthorizationChallenge(input.output);

  return {
    type: "authorization_required",
    name: connectionName,
    description: `${connectionName} connection`,
    authorization: challenge,
  };
}

function parseMcpConnectionName(toolName: string): string {
  const rest = toolName.slice(MCP_PREFIX.length);
  const sep = rest.indexOf("__");
  return sep === -1 ? rest : rest.slice(0, sep);
}

function looksLikeAuthFailure(output: unknown): boolean {
  if (output === null || output === undefined) return false;

  if (typeof output === "string") {
    return /\b401\b|unauthorized|authentication required|invalid token|expired token/i.test(
      output,
    );
  }

  if (typeof output === "object") {
    const record = output as Record<string, unknown>;
    const status = record.status ?? record.statusCode ?? record.code;
    if (status === 401 || status === "401" || status === "UNAUTHORIZED") return true;

    const message = [record.message, record.error, record.detail]
      .filter((value) => typeof value === "string")
      .join(" ");
    if (message.length > 0 && looksLikeAuthFailure(message)) return true;
  }

  return false;
}

function extractAuthorizationChallenge(output: unknown): Record<string, unknown> | undefined {
  if (output === null || typeof output !== "object") return undefined;

  const record = output as Record<string, unknown>;
  const authorization = record.authorization;
  if (authorization !== null && typeof authorization === "object" && !Array.isArray(authorization)) {
    return authorization as Record<string, unknown>;
  }

  const url =
    typeof record.url === "string"
      ? record.url
      : typeof record.authorizationUrl === "string"
        ? record.authorizationUrl
        : undefined;

  if (url !== undefined) {
    return {
      url,
      ...(typeof record.userCode === "string" ? { userCode: record.userCode } : {}),
      ...(typeof record.instructions === "string" ? { instructions: record.instructions } : {}),
      ...(typeof record.displayName === "string" ? { displayName: record.displayName } : {}),
    };
  }

  return undefined;
}