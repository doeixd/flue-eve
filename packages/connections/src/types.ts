import type { VercelConnectAuthSpec } from "./vercel-connect.js";

export interface ConnectionToolMetadata {
  readonly name: string;
  readonly description: string;
  readonly qualifiedName: string;
  readonly inputSchema?: Record<string, unknown>;
  readonly outputSchema?: Record<string, unknown>;
}

export interface ConnectionSummary {
  readonly name: string;
  readonly description: string;
  readonly url?: string;
}

export interface FlueConnectionMcpConfig {
  readonly url: string;
  readonly transport?: "streamable-http" | "sse";
  readonly headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
}

export interface FlueConnectionDefinition {
  readonly name: string;
  readonly description: string;
  readonly mcp?: FlueConnectionMcpConfig;
  /** Optional Eve/Connect auth provider (`connect("oauth/linear")` shape). */
  readonly auth?: VercelConnectAuthSpec;
  /** Static tool catalog for /info and connection__search without live MCP. */
  readonly tools?: readonly ConnectionToolMetadata[];
}

export interface ConnectionSearchInput {
  readonly keywords: string;
  readonly connection?: string;
  readonly limit?: number;
}

export interface ConnectionSearchResultItem {
  readonly connection: string;
  readonly description: string;
  readonly error?: string;
  readonly inputSchema?: Record<string, unknown>;
  readonly needsAuthorization?: boolean;
  readonly outputSchema?: Record<string, unknown>;
  readonly qualifiedName?: string;
  readonly tool?: string;
}

export interface RegisteredConnection {
  readonly name: string;
  readonly description: string;
  /** Load MCP tools when `@flue/runtime` is installed; otherwise returns registered metadata. */
  tools(): Promise<readonly ConnectionToolMetadata[]>;
}

export interface ConnectionSearchToolDefinition {
  readonly name: "connection__search";
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  execute(input: ConnectionSearchInput): Promise<readonly ConnectionSearchResultItem[]>;
}