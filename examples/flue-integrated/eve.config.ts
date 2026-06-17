import { defineEveCompat } from "flue-eve/vite/config";

export default defineEveCompat({
  agentName: "assistant",
  model: "anthropic/claude-sonnet-4-6",
  eveMount: "/eve/v1",
  fluePort: 3583,
  flueTarget: "node",
  spawnFlueDev: true,
  validateProject: true,
});