import { type AgentRouteHandler, createAgent, defineTool } from "@flue/runtime";
import { toFlueToolDefinition } from "flue-eve/connections";

import { connectionSearchTool } from "../connections/index.js";

export const route: AgentRouteHandler = async (_c, next) => next();

export default createAgent(async () => ({
  model: "anthropic/claude-sonnet-4-6",
  instructions:
    "You are a helpful assistant. Use connection__search to discover Linear tools when the user asks about issues or projects.",
  tools: [defineTool(toFlueToolDefinition(connectionSearchTool))],
}));