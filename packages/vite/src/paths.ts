import { existsSync } from "node:fs";
import { join } from "node:path";

export interface FlueProjectLayout {
  readonly root: string;
  readonly sourceDir: string;
  readonly appFile: string;
  readonly shimFile: string;
  readonly agentsDir: string;
  readonly agentToolsDir?: string;
  readonly agentConnectionsDir?: string;
  readonly toolsDir?: string;
  readonly connectionsDir?: string;
}

export function resolveFlueProjectLayout(root: string): FlueProjectLayout {
  const sourceDir = resolveSourceDir(root);
  return {
    root,
    sourceDir,
    appFile: join(sourceDir, "app.ts"),
    shimFile: join(sourceDir, "flue-eve-shim.ts"),
    agentsDir: join(sourceDir, "agents"),
    agentToolsDir: join(root, "agent", "tools"),
    agentConnectionsDir: join(root, "agent", "connections"),
    toolsDir: join(sourceDir, "tools"),
    connectionsDir: join(sourceDir, "connections"),
  };
}

function resolveSourceDir(root: string): string {
  if (existsSync(join(root, ".flue", "src"))) return join(root, ".flue", "src");
  if (existsSync(join(root, "src"))) return join(root, "src");
  return root;
}
