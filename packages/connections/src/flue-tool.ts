import type { ConnectionSearchToolDefinition } from "./types.js";

/** Minimal Flue `defineTool()` input from a connection search tool definition. */
export function toFlueToolDefinition(tool: ConnectionSearchToolDefinition): {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  readonly execute: ConnectionSearchToolDefinition["execute"];
} {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    execute: tool.execute,
  };
}