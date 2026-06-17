const MCP_PREFIX = "mcp__";
const CONNECTION_PREFIX = "connection__";

export function flueToolNameToEve(toolName: string): string {
  if (!toolName.startsWith(MCP_PREFIX)) return toolName;
  const rest = toolName.slice(MCP_PREFIX.length);
  const sep = rest.indexOf("__");
  if (sep === -1) return toolName;
  const server = rest.slice(0, sep);
  const tool = rest.slice(sep + 2);
  if (server.length === 0 || tool.length === 0) return toolName;
  return `${CONNECTION_PREFIX}${server}__${tool}`;
}

export function eveToolNameToFlue(toolName: string): string {
  if (!toolName.startsWith(CONNECTION_PREFIX)) return toolName;
  const rest = toolName.slice(CONNECTION_PREFIX.length);
  const sep = rest.indexOf("__");
  if (sep === -1) return toolName;
  const server = rest.slice(0, sep);
  const tool = rest.slice(sep + 2);
  if (server.length === 0 || tool.length === 0) return toolName;
  return `${MCP_PREFIX}${server}__${tool}`;
}