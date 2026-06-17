import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { FlueProjectLayout } from "./paths.js";

export interface ValidationOptions {
  readonly layout: FlueProjectLayout;
  readonly agentName: string;
  readonly scaffoldSidecar?: boolean;
  readonly scaffoldAgent?: boolean;
  readonly scaffoldTools?: boolean;
  readonly scaffoldConnections?: boolean;
  readonly scaffoldAppMount?: boolean;
}

export function validateFlueProject(options: ValidationOptions): string[] {
  const warnings: string[] = [];
  const { layout, agentName } = options;
  const packageJson = join(layout.root, "package.json");

  if (!existsSync(packageJson)) {
    warnings.push("[flue-eve] no package.json found in Flue project root.");
    return warnings;
  }

  const pkg = JSON.parse(readText(packageJson)) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  if (!hasDependency(pkg, "@flue/runtime")) {
    warnings.push("[flue-eve] missing dependency @flue/runtime.");
  }
  if (!hasDependency(pkg, "@flue/cli")) {
    warnings.push("[flue-eve] missing devDependency @flue/cli (needed for `flue dev`).");
  }
  if (!hasDependency(pkg, "flue-eve") && !hasDependency(pkg, "@flue-eve/compat-server")) {
    warnings.push("[flue-eve] missing dependency flue-eve (or @flue-eve/compat-server) for the Eve shim.");
  }

  if (!existsSync(join(layout.root, "flue.config.ts")) && !existsSync(join(layout.root, "flue.config.js"))) {
    warnings.push("[flue-eve] missing flue.config.ts.");
  }

  const agentFile = join(layout.agentsDir, `${agentName}.ts`);
  if (!existsSync(agentFile) && !options.scaffoldAgent) {
    warnings.push(`[flue-eve] agent module not found: ${agentFile} (set scaffold.agent: true to create).`);
  }

  const agentToolsDir = layout.agentToolsDir ?? join(layout.root, "agent", "tools");
  if (!existsSync(agentToolsDir) && !options.scaffoldTools) {
    warnings.push(
      `[flue-eve] missing agent tools directory: ${agentToolsDir} (set scaffold.tools: true to generate adapters from agent/tools).`,
    );
  }

  const agentConnectionsDir = layout.agentConnectionsDir ?? join(layout.root, "agent", "connections");
  if (!existsSync(agentConnectionsDir) && !options.scaffoldConnections) {
    warnings.push(
      `[flue-eve] missing agent connections directory: ${agentConnectionsDir} (set scaffold.connections: true to generate a connection registry from agent/connections).`,
    );
  }

  if (!existsSync(layout.shimFile) && !options.scaffoldSidecar && !options.scaffoldAppMount) {
    warnings.push(
      `[flue-eve] missing ${layout.shimFile}. Set scaffold: true or add mountEveCompat() manually.`,
    );
  }

  if (process.env.NODE_ENV === "production" && !process.env.EVE_AUTH_BEARER) {
    warnings.push(
      "[flue-eve] NODE_ENV=production without EVE_AUTH_BEARER — Eve session routes fail closed (401). See DEPLOYMENT.md.",
    );
  }

  return warnings;
}

function hasDependency(
  pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> },
  name: string,
): boolean {
  return Boolean(pkg.dependencies?.[name] || pkg.devDependencies?.[name]);
}

function readText(file: string): string {
  return readFileSync(file, "utf8");
}
