import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

export interface FlueEvePluginOptions {
  readonly flueRoot?: string;
  readonly agentName?: string;
  readonly flueTarget?: "node" | "cloudflare";
  readonly fluePort?: number;
  readonly eveMount?: string;
  readonly spawnFlueDev?: boolean;
  readonly forceScaffold?: boolean;
  readonly assistedMigration?: boolean;
  readonly strictMigration?: boolean;
  readonly scaffold?: boolean | EveCompatScaffoldConfig;
  readonly aliasEveImports?: "auto" | boolean;
  readonly previewFluePort?: number;
  readonly modelId?: string;
  readonly instructions?: string;
  readonly validateProject?: boolean;
}

export interface EveCompatScaffoldConfig {
  readonly agent?: boolean;
  readonly tools?: boolean;
  readonly connections?: boolean;
  readonly appMount?: boolean;
  readonly forceScaffold?: boolean;
  readonly assistedMigration?: boolean;
  readonly strictMigration?: boolean;
}

/** Shape of `eve.config.ts` (also accepted as `FlueEvePluginOptions` subset). */
export interface EveCompatConfig {
  readonly agentName?: string;
  readonly model?: string;
  readonly eveMount?: string;
  readonly fluePort?: number;
  readonly flueTarget?: "node" | "cloudflare";
  readonly spawnFlueDev?: boolean;
  readonly forceScaffold?: boolean;
  readonly assistedMigration?: boolean;
  readonly strictMigration?: boolean;
  readonly scaffold?: boolean | EveCompatScaffoldConfig;
  readonly aliasEveImports?: "auto" | boolean;
  readonly previewFluePort?: number;
  readonly instructions?: string;
  readonly validateProject?: boolean;
  readonly flueRoot?: string;
}

export interface ResolvedFlueEveOptions {
  readonly agentName: string;
  readonly modelId?: string;
  readonly eveMount: string;
  readonly fluePort: number;
  readonly flueTarget: "node" | "cloudflare";
  readonly spawnFlueDev: boolean;
  readonly forceScaffold: boolean;
  readonly assistedMigration: boolean;
  readonly strictMigration: boolean;
  readonly scaffold: boolean | EveCompatScaffoldConfig | undefined;
  readonly aliasEveImports: "auto" | boolean;
  readonly previewFluePort: number;
  readonly instructions?: string;
  readonly validateProject: boolean;
  readonly flueRoot?: string;
}

const EVE_CONFIG_CANDIDATES = [
  "eve.config.ts",
  "eve.config.mts",
  "eve.config.js",
  "eve.config.mjs",
] as const;

export function defineEveCompat(config: EveCompatConfig): EveCompatConfig {
  return config;
}

export function findEveConfigPath(flueRoot: string): string | undefined {
  for (const name of EVE_CONFIG_CANDIDATES) {
    const path = join(flueRoot, name);
    if (existsSync(path)) return path;
  }
  return undefined;
}

export async function loadEveConfigFile(flueRoot: string): Promise<EveCompatConfig | undefined> {
  const path = findEveConfigPath(flueRoot);
  if (path === undefined) return undefined;

  const { buildSync } = await import("esbuild");
  const result = buildSync({
    entryPoints: [path],
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
  });

  const code = result.outputFiles[0]?.text;
  if (code === undefined || code.length === 0) return undefined;

  mkdirSync(join(flueRoot, ".tmp"), { recursive: true });
  const tempDir = mkdtempSync(join(flueRoot, ".tmp", "eve-config-"));
  const tempPath = join(tempDir, "eve.config.cjs");
  writeFileSync(tempPath, code);
  const localRequire = createRequire(join(flueRoot, "package.json"));
  const config = localRequire(tempPath) as { default?: unknown };
  return normalizeLoadedConfig(config.default ?? config);
}

export function mergeFlueEveOptions(
  fileConfig: EveCompatConfig | undefined,
  pluginOptions: FlueEvePluginOptions,
): ResolvedFlueEveOptions {
  const fromFile: EveCompatConfig = fileConfig ?? {};
  const eveMount = normalizeMount(fromFile.eveMount ?? "/eve/v1");

  const merged: ResolvedFlueEveOptions = {
    agentName: fromFile.agentName ?? "assistant",
    modelId: fromFile.model,
    eveMount,
    fluePort: fromFile.fluePort ?? 3583,
    flueTarget: fromFile.flueTarget ?? "node",
    spawnFlueDev: fromFile.spawnFlueDev ?? true,
    forceScaffold: fromFile.forceScaffold ?? false,
    assistedMigration: fromFile.assistedMigration ?? false,
    strictMigration: fromFile.strictMigration ?? false,
    scaffold: fromFile.scaffold,
    aliasEveImports: fromFile.aliasEveImports ?? "auto",
    previewFluePort: fromFile.previewFluePort ?? 3000,
    instructions: fromFile.instructions,
    validateProject: fromFile.validateProject ?? fromFile.spawnFlueDev ?? true,
    flueRoot: fromFile.flueRoot,
  };

  return {
    agentName: pluginOptions.agentName ?? merged.agentName,
    modelId: pluginOptions.modelId ?? merged.modelId,
    eveMount: normalizeMount(pluginOptions.eveMount ?? merged.eveMount),
    fluePort: pluginOptions.fluePort ?? merged.fluePort,
    flueTarget: pluginOptions.flueTarget ?? merged.flueTarget,
    spawnFlueDev: pluginOptions.spawnFlueDev ?? merged.spawnFlueDev,
    forceScaffold: pluginOptions.forceScaffold ?? merged.forceScaffold,
    assistedMigration: pluginOptions.assistedMigration ?? merged.assistedMigration,
    strictMigration: pluginOptions.strictMigration ?? merged.strictMigration,
    scaffold: pluginOptions.scaffold ?? merged.scaffold,
    aliasEveImports: pluginOptions.aliasEveImports ?? merged.aliasEveImports,
    previewFluePort: pluginOptions.previewFluePort ?? merged.previewFluePort,
    instructions: pluginOptions.instructions ?? merged.instructions,
    validateProject: pluginOptions.validateProject ?? merged.validateProject,
    flueRoot: pluginOptions.flueRoot ?? merged.flueRoot,
  };
}

function normalizeLoadedConfig(value: unknown): EveCompatConfig | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "object") return undefined;
  return value as EveCompatConfig;
}

function normalizeMount(mount: string): string {
  if (!mount.startsWith("/")) return `/${mount}`;
  return mount.endsWith("/") ? mount.slice(0, -1) : mount;
}
