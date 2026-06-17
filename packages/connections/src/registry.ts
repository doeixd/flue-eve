import { normalizeRegisteredTool } from "./qualified-name.js";
import type {
  ConnectionSummary,
  ConnectionToolMetadata,
  FlueConnectionDefinition,
} from "./types.js";

interface RegisteredConnectionRecord {
  readonly definition: FlueConnectionDefinition;
  tools: readonly ConnectionToolMetadata[];
}

export class ConnectionRegistry {
  readonly #connections = new Map<string, RegisteredConnectionRecord>();

  register(definition: FlueConnectionDefinition): void {
    const tools = (definition.tools ?? []).map((tool) =>
      normalizeRegisteredTool(definition.name, tool),
    );
    this.#connections.set(definition.name, { definition, tools });
  }

  setConnectionTools(connectionName: string, tools: readonly ConnectionToolMetadata[]): void {
    const record = this.#connections.get(connectionName);
    if (!record) {
      throw new Error(`Connection "${connectionName}" is not registered.`);
    }
    record.tools = tools.map((tool) => normalizeRegisteredTool(connectionName, tool));
  }

  hasConnections(): boolean {
    return this.#connections.size > 0;
  }

  getConnections(): readonly ConnectionSummary[] {
    return [...this.#connections.values()].map((record) => ({
      name: record.definition.name,
      description: record.definition.description,
      ...(record.definition.mcp?.url ? { url: record.definition.mcp.url } : {}),
    }));
  }

  getConnectionTools(connectionName: string): readonly ConnectionToolMetadata[] {
    return this.#connections.get(connectionName)?.tools ?? [];
  }

  listAllTools(): readonly ConnectionToolMetadata[] {
    return [...this.#connections.values()].flatMap((record) => record.tools);
  }

  getDefinition(connectionName: string): FlueConnectionDefinition | undefined {
    return this.#connections.get(connectionName)?.definition;
  }
}

export function createConnectionRegistry(): ConnectionRegistry {
  return new ConnectionRegistry();
}