import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { FlueProjectLayout } from "./paths.js";

const INSTRUCTIONS_CANDIDATES = ["agent/instructions.md"] as const;

export const GENERATED_MARKER = "@flue-eve/generated";
export const INJECTED_MARKER = "@flue-eve/injected";

export interface ScaffoldConfig {
  readonly eveMount: string;
  readonly agentName: string;
  readonly modelId?: string;
  readonly instructions?: string;
  readonly connections?: boolean;
}

export interface ScaffoldOptions {
  readonly layout: FlueProjectLayout;
  readonly config: ScaffoldConfig;
  readonly sidecar?: boolean;
  readonly agent?: boolean;
  readonly tools?: boolean;
  readonly connections?: boolean;
  readonly appMount?: boolean;
  readonly forceScaffold?: boolean;
}

export interface ScaffoldResult {
  readonly created: string[];
  readonly skipped: string[];
  readonly warnings: string[];
}

export function resolveInstructionsFromProject(layout: FlueProjectLayout): string | undefined {
  const candidates = [
    ...INSTRUCTIONS_CANDIDATES.map((relative) => join(layout.root, relative)),
    ...INSTRUCTIONS_CANDIDATES.map((relative) => join(layout.sourceDir, relative)),
  ];

  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const content = readFileSync(path, "utf8").trim();
    if (content.length > 0) return content;
  }

  return undefined;
}

export function runScaffold(options: ScaffoldOptions): ScaffoldResult {
  const created: string[] = [];
  const skipped: string[] = [];
  const warnings: string[] = [];
  const forceScaffold = options.forceScaffold === true;

  const instructions =
    options.config.instructions ?? resolveInstructionsFromProject(options.layout);
  const config: ScaffoldConfig = {
    ...options.config,
    ...(instructions !== undefined ? { instructions } : {}),
    connections: options.connections === true,
  };

  if (options.tools) {
    const result = runToolCodegen(options.layout, { forceScaffold });
    created.push(...result.created);
    skipped.push(...result.skipped);
    warnings.push(...result.warnings);
  }

  if (options.connections) {
    const result = runConnectionCodegen(options.layout, { forceScaffold });
    created.push(...result.created);
    skipped.push(...result.skipped);
    warnings.push(...result.warnings);
  }

  if (options.agent) {
    const agentFile = join(options.layout.agentsDir, `${config.agentName}.ts`);
    mkdirSync(options.layout.agentsDir, { recursive: true });
    const generatedTools = listGeneratedModules(agentFile, options.layout.toolsDir);
    const result = writeGeneratedFile(agentFile, renderAgent(config, generatedTools), forceScaffold);
    if (result === "created") created.push(agentFile);
    else skipped.push(agentFile);
  }

  if (options.sidecar) {
    const result = writeGeneratedFile(
      options.layout.shimFile,
      renderSidecar(config),
      forceScaffold,
    );
    if (result === "created") created.push(options.layout.shimFile);
    else skipped.push(options.layout.shimFile);
  }

  if (options.appMount) {
    if (!existsSync(options.layout.appFile)) {
      warnings.push(`[flue-eve] cannot inject app mount — missing ${options.layout.appFile}`);
    } else {
      const injected = injectAppMount(options.layout.appFile, options.layout.shimFile, forceScaffold);
      if (injected === "created") created.push(options.layout.appFile);
      else skipped.push(options.layout.appFile);
    }
  }

  return { created, skipped, warnings };
}

export function injectAppMount(
  appFile: string,
  shimFile: string,
  forceScaffold = false,
): "created" | "skipped" {
  const source = readFileSync(appFile, "utf8");
  if (!forceScaffold && source.includes(INJECTED_MARKER)) return "skipped";
  if (source.includes("mountEveCompat(app)")) return "skipped";

  const relativeImport = toRelativeImport(appFile, shimFile);
  const block = [
    `// ${INJECTED_MARKER}`,
    `import { mountEveCompat } from "${relativeImport}";`,
    "mountEveCompat(app);",
    "",
  ].join("\n");

  const anchor = "export default app";
  const index = source.lastIndexOf(anchor);
  if (index === -1) {
    writeFileSync(appFile, `${source.trimEnd()}\n\n${block}`, "utf8");
    return "created";
  }

  writeFileSync(appFile, `${source.slice(0, index)}${block}${source.slice(index)}`, "utf8");
  return "created";
}

export function renderSidecar(config: ScaffoldConfig): string {
  const connectionImport =
    config.connections === true ? `import { connectionRegistry } from "./connections/index.ts";\n` : "";

  return `// ${GENERATED_MARKER} — safe to edit; not overwritten when present
import {
  eveCompat,
  resolveAdmissionFromRuntime,
  resolveEveCompatDefaults,
} from "@flue-eve/compat-server";
import type { Hono } from "hono";
${connectionImport}
export const flueEveConfig = {
  eveMount: ${JSON.stringify(config.eveMount)},
  agentName: ${JSON.stringify(config.agentName)},
} as const;

function resolveEveAdmission() {
  return resolveAdmissionFromRuntime(flueEveConfig.agentName, {
    flueBaseUrl: process.env.FLUE_BASE_URL,
  });
}

export function mountEveCompat(app: Hono): void {
  app.route(
    flueEveConfig.eveMount,
    eveCompat({
      agentName: flueEveConfig.agentName,
      ${config.connections === true ? "connections: connectionRegistry," : ""}
      ...resolveEveCompatDefaults(),
      admission: resolveEveAdmission(),
    }),
  );
}
`;
}

export function renderAgent(config: ScaffoldConfig, toolModules: readonly string[] = []): string {
  const modelId = config.modelId ?? "anthropic/claude-sonnet-4-6";
  const instructions = config.instructions ?? "You are a helpful assistant.";
  const imports = uniqueList(
    toolModules.map((modulePath, index) => ({
      name: toUniqueIdentifier(stripExtension(modulePath), index, toolModules),
      path: modulePath,
    })),
  );
  const toolList =
    imports.length > 0 ? `,\n  tools: [${imports.map((entry) => entry.name).join(", ")}]` : "";

  return `// ${GENERATED_MARKER} — safe to delete and replace
import { type AgentRouteHandler, createAgent } from "@flue/runtime";
${imports.map((entry) => `import ${entry.name} from ${JSON.stringify(entry.path)};`).join("\n")}

export const route: AgentRouteHandler = async (_c, next) => next();

export default createAgent(() => ({
  model: ${JSON.stringify(modelId)},
  instructions: ${JSON.stringify(instructions)}${toolList}
}));
`;
}

export interface ToolCodegenResult {
  readonly created: string[];
  readonly skipped: string[];
  readonly warnings: string[];
}

export function runToolCodegen(
  layout: FlueProjectLayout,
  options: { readonly forceScaffold?: boolean } = {},
): ToolCodegenResult {
  const created: string[] = [];
  const skipped: string[] = [];
  const warnings: string[] = [];

  const agentToolsDir = layout.agentToolsDir ?? join(layout.root, "agent", "tools");
  const toolsDir = layout.toolsDir ?? join(layout.sourceDir, "tools");

  if (!existsSync(agentToolsDir)) {
    return { created, skipped, warnings };
  }

  mkdirSync(toolsDir, { recursive: true });
  for (const entry of readdirSync(agentToolsDir)) {
    if (!entry.endsWith(".ts")) continue;
    const sourcePath = join(agentToolsDir, entry);
    if (!statSync(sourcePath).isFile()) continue;
    const targetPath = join(toolsDir, entry);
    const result = writeGeneratedFile(
      targetPath,
      renderGeneratedTool(targetPath, sourcePath),
      options.forceScaffold === true,
    );
    if (result === "created") created.push(targetPath);
    else skipped.push(targetPath);
  }

  return { created, skipped, warnings };
}

export interface ConnectionCodegenResult {
  readonly created: string[];
  readonly skipped: string[];
  readonly warnings: string[];
}

export function runConnectionCodegen(
  layout: FlueProjectLayout,
  options: { readonly forceScaffold?: boolean } = {},
): ConnectionCodegenResult {
  const created: string[] = [];
  const skipped: string[] = [];
  const warnings: string[] = [];

  const agentConnectionsDir = layout.agentConnectionsDir ?? join(layout.root, "agent", "connections");
  const connectionsDir = layout.connectionsDir ?? join(layout.sourceDir, "connections");

  if (!existsSync(agentConnectionsDir)) {
    return { created, skipped, warnings };
  }

  const imports: Array<{ readonly name: string; readonly path: string }> = [];
  for (const entry of readdirSync(agentConnectionsDir)) {
    if (!entry.endsWith(".ts")) continue;
    const sourcePath = join(agentConnectionsDir, entry);
    if (!statSync(sourcePath).isFile()) continue;

    const source = readFileSync(sourcePath, "utf8");
    if (!isSupportedConnectionSource(source)) {
      warnings.push(
        `[flue-eve] unsupported connection pattern in ${sourcePath} — skipping codegen; author a manual connection registry or use a simple default export.`,
      );
      continue;
    }

    imports.push({
      name: toIdentifier(stripExtension(entry), imports.length),
      path: toRelativeImport(join(connectionsDir, "index.ts"), sourcePath),
    });
  }

  if (imports.length === 0) {
    return { created, skipped, warnings };
  }

  mkdirSync(connectionsDir, { recursive: true });
  const targetPath = join(connectionsDir, "index.ts");
  const result = writeGeneratedFile(
    targetPath,
    renderConnectionRegistry(imports),
    options.forceScaffold === true,
  );
  if (result === "created") created.push(targetPath);
  else skipped.push(targetPath);

  return { created, skipped, warnings };
}

export function renderGeneratedTool(targetPath: string, sourcePath: string): string {
  const importPath = toRelativeImport(targetPath, sourcePath);
  return `// ${GENERATED_MARKER} — safe to edit; not overwritten when present
import { defineTool } from "@flue/runtime";
import toolModule from ${JSON.stringify(importPath)};

const source = toolModule as {
  readonly name?: string;
  readonly description?: string;
  readonly parameters?: Record<string, unknown>;
  readonly execute?: (...args: readonly unknown[]) => unknown;
};

export default defineTool({
  name: source.name ?? ${JSON.stringify(stripExtension(sourcePath))},
  description: source.description ?? "",
  parameters: source.parameters ?? {},
  execute: source.execute ?? (async () => undefined),
});
`;
}

export function renderConnectionRegistry(
  imports: readonly { readonly name: string; readonly path: string }[],
): string {
  const importLines = imports.map((entry, index) => {
    const name = toUniqueIdentifier(entry.name, index, imports.map((item) => item.path));
    return `import ${name} from ${JSON.stringify(entry.path)};`;
  });
  const registrations = imports.map((entry, index) => {
    const name = toUniqueIdentifier(entry.name, index, imports.map((item) => item.path));
    return `defineFlueConnection(toFlueConnection(${JSON.stringify(entry.name)}, ${name}), connectionRegistry);`;
  });
  return `// ${GENERATED_MARKER} — safe to edit; not overwritten when present
import { createConnectionRegistry, defineFlueConnection } from "@flue-eve/connections";
import type { FlueConnectionDefinition } from "@flue-eve/connections";
${importLines.join("\n")}

export const connectionRegistry = createConnectionRegistry();

${registrations.join("\n")}

function toFlueConnection(
  name: string,
  source: FlueConnectionDefinition | {
    readonly name?: string;
    readonly description?: string;
    readonly url?: string;
    readonly auth?: unknown;
    readonly headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
    readonly tools?: FlueConnectionDefinition["tools"];
  },
): FlueConnectionDefinition {
  if ("mcp" in source || source.name !== undefined) {
    return source as FlueConnectionDefinition;
  }

  if (typeof source.url === "string" && source.url.length > 0) {
    return {
      name,
      description: source.description ?? "",
      mcp: {
        url: source.url,
        headers: source.headers,
      },
      auth: source.auth as FlueConnectionDefinition["auth"],
      tools: source.tools,
    };
  }

  return {
    name,
    description: source.description ?? "",
    tools: source.tools ?? [],
  };
}
`;
}

function writeGeneratedFile(file: string, contents: string, forceScaffold: boolean): "created" | "skipped" {
  if (existsSync(file)) {
    if (!forceScaffold) return "skipped";
    const existing = readFileSync(file, "utf8");
    if (!existing.includes(GENERATED_MARKER)) return "skipped";
  }

  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents, "utf8");
  return "created";
}

function stripExtension(file: string): string {
  const base = file.split(/[\\/]/).pop() ?? file;
  return base.replace(/\.ts$/, "");
}

function toIdentifier(base: string, index: number): string {
  const normalized = base.replace(/[^A-Za-z0-9_$]/g, "_");
  return /^[A-Za-z_$]/.test(normalized) && normalized.length > 0
    ? normalized
    : `generated_${index}`;
}

function toUniqueIdentifier(base: string, index: number, allPaths: readonly string[]): string {
  const normalized = toIdentifier(base, index);
  const collisionCount = allPaths.filter((path) => toIdentifier(stripExtension(path), index) === normalized).length;
  if (collisionCount <= 1) return normalized;
  return `${normalized}_${index}`;
}

function uniqueList<T extends { readonly path: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (seen.has(item.path)) continue;
    seen.add(item.path);
    result.push(item);
  }
  return result;
}

function listGeneratedModules(fromFile: string, dir: string | undefined): string[] {
  if (dir === undefined || !existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((entry) => entry.endsWith(".ts"))
    .map((entry) => toRelativeImport(fromFile, join(dir, entry)));
}

function isSupportedConnectionSource(source: string): boolean {
  return (
    source.includes("defineMcpClientConnection") ||
    source.includes("defineOpenAPIConnection") ||
    source.includes("export default")
  );
}

function toRelativeImport(fromFile: string, toFile: string): string {
  const fromDir = dirname(fromFile).replace(/\\/g, "/");
  const target = toFile.replace(/\\/g, "/");
  const fromParts = fromDir.split("/").filter(Boolean);
  const toParts = target.split("/").filter(Boolean);
  const fileName = toParts.pop() ?? "flue-eve-shim.ts";
  let shared = 0;
  while (
    shared < fromParts.length &&
    shared < toParts.length &&
    fromParts[shared] === toParts[shared]
  ) {
    shared += 1;
  }
  const ups = fromParts.length - shared;
  const path = [...Array.from({ length: ups }, () => ".."), ...toParts.slice(shared), fileName];
  const joined = path.join("/");
  if (!joined.startsWith(".") && !joined.startsWith("/")) return `./${joined}`;
  return joined;
}
