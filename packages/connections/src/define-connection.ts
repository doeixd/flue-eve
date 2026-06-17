import { flueToolNameToEve } from "@flue-eve/shared";

import type { ConnectionRegistry } from "./registry.js";
import { normalizeRegisteredTool } from "./qualified-name.js";
import { mergeMcpHeaders, resolveConnectMcpHeaders } from "./vercel-connect.js";
import type {
  ConnectionToolMetadata,
  FlueConnectionDefinition,
  RegisteredConnection,
} from "./types.js";

export function defineFlueConnection(
  definition: FlueConnectionDefinition,
  registry: ConnectionRegistry,
): RegisteredConnection {
  registry.register(definition);

  return {
    name: definition.name,
    description: definition.description,
    async tools(): Promise<readonly ConnectionToolMetadata[]> {
      if (definition.tools !== undefined) {
        return definition.tools.map((tool) => normalizeRegisteredTool(definition.name, tool));
      }

      if (definition.mcp === undefined) {
        return registry.getConnectionTools(definition.name);
      }

      const runtime = await import("@flue/runtime").catch(() => undefined);
      if (runtime?.connectMcpServer === undefined) {
        return registry.getConnectionTools(definition.name);
      }

      let headers =
        typeof definition.mcp.headers === "function"
          ? await definition.mcp.headers()
          : definition.mcp.headers;

      if (definition.auth !== undefined) {
        const connectHeaders = await resolveConnectMcpHeaders({
          auth: definition.auth,
          mcp: definition.mcp,
          connectionName: definition.name,
        });
        headers = mergeMcpHeaders(headers, connectHeaders);
      }

      const connection = await runtime.connectMcpServer(definition.name, {
        url: definition.mcp.url,
        transport: definition.mcp.transport,
        headers,
      });

      try {
        const metadata = connection.tools.map((tool) =>
          normalizeRegisteredTool(definition.name, {
            name: parseMcpToolSuffix(definition.name, tool.name),
            description: tool.description ?? "",
            qualifiedName: flueToolNameToEve(tool.name),
            inputSchema: tool.parameters as Record<string, unknown> | undefined,
          }),
        );
        registry.setConnectionTools(definition.name, metadata);
        return metadata;
      } finally {
        await connection.close();
      }
    },
  };
}

function parseMcpToolSuffix(connectionName: string, adaptedName: string): string {
  const prefix = `mcp__${connectionName}__`;
  if (adaptedName.startsWith(prefix)) {
    return adaptedName.slice(prefix.length);
  }
  const parts = adaptedName.split("__");
  return parts.at(-1) ?? adaptedName;
}