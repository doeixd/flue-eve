import type { ConnectionRegistry } from "./registry.js";
import type { ConnectionSearchInput, ConnectionSearchResultItem } from "./types.js";

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s_\-./]+/)
    .filter((token) => token.length > 1);
}

function scoreMatch(queryTokens: readonly string[], tool: { readonly name: string; readonly description: string }): number {
  const nameTokens = tokenize(tool.name);
  const descriptionTokens = tokenize(tool.description);
  let score = 0;

  for (const queryToken of queryTokens) {
    for (const nameToken of nameTokens) {
      if (nameToken.includes(queryToken) || queryToken.includes(nameToken)) score += 3;
    }
    for (const descriptionToken of descriptionTokens) {
      if (descriptionToken.includes(queryToken) || queryToken.includes(descriptionToken)) score += 1;
    }
  }

  return score;
}

export function searchConnections(
  registry: ConnectionRegistry,
  input: ConnectionSearchInput,
): readonly ConnectionSearchResultItem[] {
  const limit = input.limit ?? 10;
  const queryTokens = tokenize(input.keywords);
  const connections = registry.getConnections().filter((connection) =>
    input.connection ? connection.name === input.connection : true,
  );

  if (queryTokens.length === 0) {
    return connections.map((connection) => ({
      connection: connection.name,
      description: connection.description,
    }));
  }

  const scored: Array<{ readonly item: ConnectionSearchResultItem; readonly score: number }> = [];

  for (const connection of connections) {
    for (const tool of registry.getConnectionTools(connection.name)) {
      const score = scoreMatch(queryTokens, tool);
      if (score <= 0) continue;
      scored.push({
        score,
        item: {
          connection: connection.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          outputSchema: tool.outputSchema,
          qualifiedName: tool.qualifiedName,
          tool: tool.name,
        },
      });
    }
  }

  scored.sort((left, right) => right.score - left.score);
  return scored.slice(0, limit).map((entry) => entry.item);
}