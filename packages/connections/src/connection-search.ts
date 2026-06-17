import type { ConnectionRegistry } from "./registry.js";
import { searchConnections } from "./search.js";
import type { ConnectionSearchInput, ConnectionSearchToolDefinition } from "./types.js";

export function createConnectionSearchTool(registry: ConnectionRegistry): ConnectionSearchToolDefinition {
  const connections = registry.getConnections();
  const connectionNames = connections.map((connection) => connection.name);

  return {
    name: "connection__search",
    description:
      "Search for tools across your connections. Discovered tools become directly callable by their qualified name " +
      "(e.g. `connection__linear__list_issues`) in your next response." +
      (connectionNames.length > 0 ? ` Available connections: ${connectionNames.join(", ")}.` : ""),
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        keywords: {
          type: "string",
          description:
            "Search keywords and expanded aliases. Distill intent into keywords; avoid stop words like 'a', 'the', 'in'.",
        },
        connection: {
          type: "string",
          description: "Optional: limit search to a specific connection name.",
        },
        limit: {
          type: "number",
          description: "Max results to return. Default 10.",
        },
      },
      required: ["keywords"],
    },
    async execute(input: ConnectionSearchInput) {
      return searchConnections(registry, input);
    },
  };
}