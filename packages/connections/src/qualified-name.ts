import { flueToolNameToEve } from "@flue-eve/shared";

import type { ConnectionToolMetadata } from "./types.js";

export function qualifiedConnectionToolName(connectionName: string, toolName: string): string {
  return flueToolNameToEve(`mcp__${connectionName}__${toolName}`);
}

export function normalizeRegisteredTool(
  connectionName: string,
  tool: Omit<ConnectionToolMetadata, "qualifiedName"> & { readonly qualifiedName?: string },
): ConnectionToolMetadata {
  return {
    ...tool,
    qualifiedName: tool.qualifiedName ?? qualifiedConnectionToolName(connectionName, tool.name),
  };
}