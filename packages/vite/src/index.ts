import type { Plugin, ResolvedConfig } from "vite";

import {
  loadEveConfigFile,
  mergeFlueEveOptions,
  type FlueEvePluginOptions,
  type ResolvedFlueEveOptions,
} from "./config.js";
import { waitForUpstream } from "./health.js";
import { resolveFlueProjectLayout } from "./paths.js";
import { runScaffold, type ScaffoldConfig } from "./scaffold.js";
import { validateFlueProject } from "./validate.js";

export type { EveCompatConfig, FlueEvePluginOptions, ResolvedFlueEveOptions } from "./config.js";
export { defineEveCompat, findEveConfigPath, loadEveConfigFile, mergeFlueEveOptions } from "./config.js";

const VIRTUAL_CONFIG_ID = "virtual:flue-eve-config";
const RESOLVED_VIRTUAL_CONFIG_ID = "\0virtual:flue-eve-config";

const PROXY_BLOCKED_HEADERS = new Set([
  "cookie",
  "authorization",
  "set-cookie",
  "host",
  "origin",
  "referer",
]);

export function flueEve(pluginOptions: FlueEvePluginOptions = {}): Plugin {
  let resolved: ResolvedFlueEveOptions = mergeFlueEveOptions(undefined, pluginOptions);
  let config: ResolvedConfig;

  const scaffoldFlags = () => resolveScaffoldFlags(resolved.scaffold);
  const scaffoldConfig = (): ScaffoldConfig => ({
    agentName: resolved.agentName,
    eveMount: resolved.eveMount,
    instructions: resolved.instructions,
    modelId: resolved.modelId,
    connections: resolveScaffoldFlags(resolved.scaffold).connections,
  });

  let flueProcess: ReturnType<typeof import("node:child_process").spawn> | undefined;

  return {
    name: "flue-eve",
    async configResolved(viteConfig) {
      config = viteConfig;
      const flueRoot = pluginOptions.flueRoot ?? viteConfig.root;
      const fileConfig = await loadEveConfigFile(flueRoot);
      resolved = mergeFlueEveOptions(fileConfig, {
        ...pluginOptions,
        flueRoot: pluginOptions.flueRoot ?? flueRoot,
      });
    },
    config(_userConfig, _env) {
      const alias: Record<string, string> = {};
      const aliasEveImports = pluginOptions.aliasEveImports ?? "auto";
      if (aliasEveImports === true || aliasEveImports === "auto") {
        alias["eve/client"] = "flue-eve/client";
        alias["eve/react"] = "flue-eve/react";
      }
      return { resolve: { alias } };
    },
    buildStart() {
      const flueRoot = resolved.flueRoot ?? config.root;
      const layout = resolveFlueProjectLayout(flueRoot);
      const flags = scaffoldFlags();

      if (flags.enabled) {
        const result = runScaffold({
          layout,
          config: scaffoldConfig(),
          sidecar: flags.sidecar,
          agent: flags.agent,
          tools: flags.tools,
          connections: flags.connections,
          appMount: flags.appMount,
          forceScaffold: resolved.forceScaffold || flags.forceScaffold,
        });
        for (const file of result.created) {
          config.logger.info(`[flue-eve] scaffolded ${file}`);
        }
        for (const warning of result.warnings) {
          config.logger.warn(warning);
        }
      }

      if (resolved.validateProject) {
        for (const warning of validateFlueProject({
          layout,
          agentName: resolved.agentName,
          scaffoldAgent: flags.agent,
          scaffoldTools: flags.tools,
          scaffoldConnections: flags.connections,
          scaffoldAppMount: flags.appMount,
          scaffoldSidecar: flags.sidecar,
        })) {
          config.logger.warn(warning);
        }
      }
    },
    resolveId(id) {
      if (id === VIRTUAL_CONFIG_ID) return RESOLVED_VIRTUAL_CONFIG_ID;
      return undefined;
    },
    load(id) {
      if (id !== RESOLVED_VIRTUAL_CONFIG_ID) return undefined;
      return `export default ${JSON.stringify({
        agentName: resolved.agentName,
        eveMount: resolved.eveMount,
      })};`;
    },
    async configureServer(server) {
      const flueRoot = resolved.flueRoot ?? config.root;
      const target = `http://127.0.0.1:${resolved.fluePort}`;
      const eveMount = resolved.eveMount;

      if (resolved.spawnFlueDev) {
        const { spawn } = await import("node:child_process");
        flueProcess = spawn(
          process.platform === "win32" ? "npx.cmd" : "npx",
          ["flue", "dev", "--target", resolved.flueTarget, "--port", String(resolved.fluePort)],
          { cwd: flueRoot, stdio: "inherit", shell: process.platform === "win32" },
        );
        flueProcess.on("error", (error) => {
          server.config.logger.error(`[flue-eve] failed to spawn flue dev: ${error.message}`);
        });

        try {
          await waitForUpstream({ baseUrl: target, eveMount });
          server.config.logger.info(`[flue-eve] flue dev ready at ${target}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          server.config.logger.warn(`${message} — proxy may return 502 until Flue is up.`);
        }
      }

      server.middlewares.use(eveMount, async (req, res) => {
        const url = new URL(req.url ?? "/", target);
        url.pathname = `${eveMount}${url.pathname}`;

        try {
          if (!flueProcess && resolved.spawnFlueDev) {
            res.statusCode = 502;
            res.end("Flue dev server is not running.");
            return;
          }

          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (value === undefined) continue;
            if (PROXY_BLOCKED_HEADERS.has(key.toLowerCase())) continue;
            if (Array.isArray(value)) {
              for (const item of value) headers.append(key, item);
            } else {
              headers.set(key, value);
            }
          }

          const bodyBuffer =
            req.method !== "GET" && req.method !== "HEAD"
              ? await readRequestBody(req)
              : undefined;

          const upstream = await fetch(url, {
            method: req.method,
            headers,
            body: bodyBuffer ? new Uint8Array(bodyBuffer) : undefined,
          });

          res.statusCode = upstream.status;
          upstream.headers.forEach((value, key) => {
            if (key.toLowerCase() === "transfer-encoding") return;
            res.setHeader(key, value);
          });

          if (upstream.body) {
            const reader = upstream.body.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              res.write(value);
            }
          }
          res.end();
        } catch (error) {
          const message = error instanceof Error ? error.message : "proxy error";
          res.statusCode = 502;
          if (resolved.spawnFlueDev && error instanceof Error) {
            res.end("Flue dev server is unreachable.");
          } else {
            res.end(message);
          }
        }
      });

      return () => {
        flueProcess?.kill();
        flueProcess = undefined;
      };
    },
    closeBundle() {
      flueProcess?.kill();
      flueProcess = undefined;
    },
  };
}

export const flueEveVite = flueEve;

export { waitForUpstream } from "./health.js";
export {
  formatMigrationReport,
  isStrictMigrationBlocked,
  scanMigration,
  type MigrationFinding,
  type MigrationReport,
  type MigrationTier,
} from "./migration-scanner.js";
export {
  runScaffold,
  injectAppMount,
  renderSidecar,
  renderAgent,
  runToolCodegen,
  runConnectionCodegen,
  renderGeneratedTool,
  renderConnectionRegistry,
  resolveInstructionsFromProject,
  INJECTED_MARKER,
  GENERATED_MARKER,
} from "./scaffold.js";
export { resolveFlueProjectLayout } from "./paths.js";
export { validateFlueProject } from "./validate.js";

function resolveScaffoldFlags(
  scaffold: FlueEvePluginOptions["scaffold"],
): {
  enabled: boolean;
  sidecar: boolean;
  agent: boolean;
  tools: boolean;
  connections: boolean;
  appMount: boolean;
  forceScaffold: boolean;
} {
  if (scaffold === false || scaffold === undefined) {
    return {
      enabled: false,
      sidecar: false,
      agent: false,
      tools: false,
      connections: false,
      appMount: false,
      forceScaffold: false,
    };
  }
  if (scaffold === true) {
    return {
      enabled: true,
      sidecar: true,
      agent: false,
      tools: false,
      connections: false,
      appMount: false,
      forceScaffold: false,
    };
  }
  const sidecar = scaffold.appMount === true;
  return {
    enabled:
      scaffold.agent === true ||
      scaffold.tools === true ||
      scaffold.connections === true ||
      scaffold.appMount === true ||
      sidecar,
    sidecar,
    agent: scaffold.agent === true,
    tools: scaffold.tools === true,
    connections: scaffold.connections === true,
    appMount: scaffold.appMount === true,
    forceScaffold: scaffold.forceScaffold === true,
  };
}

async function readRequestBody(req: import("node:http").IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
