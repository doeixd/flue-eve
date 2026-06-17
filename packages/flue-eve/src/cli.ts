#!/usr/bin/env node
import { cwd, exit } from "node:process";

import {
  formatMigrationReport,
  isStrictMigrationBlocked,
  resolveFlueProjectLayout,
  runScaffold,
  scanMigration,
} from "@flue-eve/vite";

interface CliOptions {
  readonly agentName: string;
  readonly appMount: boolean;
  readonly connections: boolean;
  readonly eveMount: string;
  readonly force: boolean;
  readonly help: boolean;
  readonly json: boolean;
  readonly model?: string;
  readonly root: string;
  readonly sidecar: boolean;
  readonly strict: boolean;
  readonly tools: boolean;
  readonly agent: boolean;
}

const DEFAULT_OPTIONS: CliOptions = {
  agentName: "assistant",
  appMount: true,
  connections: true,
  eveMount: "/eve/v1",
  force: false,
  help: false,
  json: false,
  root: cwd(),
  sidecar: true,
  strict: false,
  tools: true,
  agent: true,
};

async function main(argv: readonly string[]): Promise<number> {
  const [command, ...args] = argv;

  if (command === undefined || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return 0;
  }

  const parsed = parseOptions(args);
  if (parsed.help) {
    printCommandHelp(command);
    return 0;
  }

  switch (command) {
    case "scan":
      return runScan(parsed);
    case "init":
      return runInit(parsed);
    default:
      console.error(`[flue-eve] Unknown command: ${command}`);
      printHelp();
      return 1;
  }
}

function runScan(options: CliOptions): number {
  const layout = resolveFlueProjectLayout(options.root);
  const report = scanMigration(layout);
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
  console.log(formatMigrationReport(report));
  }

  if (options.strict && isStrictMigrationBlocked(report)) {
    console.error("[flue-eve] Strict scan failed: Tier 2 or Tier 3 findings require review.");
    return 1;
  }

  return 0;
}

function runInit(options: CliOptions): number {
  const layout = resolveFlueProjectLayout(options.root);
  const result = runScaffold({
    layout,
    config: {
      agentName: options.agentName,
      eveMount: options.eveMount,
      ...(options.model !== undefined ? { modelId: options.model } : {}),
      connections: options.connections,
    },
    agent: options.agent,
    appMount: options.appMount,
    connections: options.connections,
    forceScaffold: options.force,
    sidecar: options.sidecar,
    tools: options.tools,
  });

  for (const file of result.created) {
    console.log(`[flue-eve] created ${file}`);
  }
  for (const file of result.skipped) {
    console.log(`[flue-eve] skipped ${file}`);
  }
  for (const warning of result.warnings) {
    console.warn(warning);
  }

  if (result.created.length === 0 && result.skipped.length === 0 && result.warnings.length === 0) {
    console.log("[flue-eve] Nothing to scaffold. Pass --help for options.");
  }

  return result.warnings.length > 0 ? 1 : 0;
}

function parseOptions(args: readonly string[]): CliOptions {
  let options = DEFAULT_OPTIONS;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) continue;

    switch (arg) {
      case "--help":
      case "-h":
        options = { ...options, help: true };
        break;
      case "--root":
        options = { ...options, root: readValue(args, ++index, "--root") };
        break;
      case "--agent-name":
        options = { ...options, agentName: readValue(args, ++index, arg) };
        break;
      case "--model":
        options = { ...options, model: readValue(args, ++index, "--model") };
        break;
      case "--eve-mount":
        options = { ...options, eveMount: readValue(args, ++index, "--eve-mount") };
        break;
      case "--strict":
        options = { ...options, strict: true };
        break;
      case "--json":
        options = { ...options, json: true };
        break;
      case "--force":
        options = { ...options, force: true };
        break;
      case "--agent":
        options = { ...options, agent: true };
        break;
      case "--tools":
        options = { ...options, tools: true };
        break;
      case "--connections":
        options = { ...options, connections: true };
        break;
      case "--sidecar":
        options = { ...options, sidecar: true };
        break;
      case "--app-mount":
        options = { ...options, appMount: true };
        break;
      case "--no-agent":
        options = { ...options, agent: false };
        break;
      case "--no-tools":
        options = { ...options, tools: false };
        break;
      case "--no-connections":
        options = { ...options, connections: false };
        break;
      case "--no-sidecar":
        options = { ...options, sidecar: false };
        break;
      case "--no-app-mount":
        options = { ...options, appMount: false };
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function readValue(args: readonly string[], index: number, flag: string): string {
  const value = args[index];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function printHelp(): void {
  console.log(`flue-eve

Usage:
  flue-eve init [options]
  flue-eve scan [options]

Commands:
  init    Scaffold the Flue/Eve bridge files for a project.
  scan    Classify an Eve project for migration effort.

Run "flue-eve <command> --help" for command-specific options.`);
}

function printCommandHelp(command: string): void {
  if (command === "scan") {
    console.log(`flue-eve scan

Options:
  --root <dir>    Project root. Defaults to the current directory.
  --strict        Exit non-zero when Tier 2 or Tier 3 findings are present.
  --json          Print the full migration report as JSON.
  --help          Show this help.`);
    return;
  }

  if (command === "init") {
    console.log(`flue-eve init

Options:
  --root <dir>          Project root. Defaults to the current directory.
  --agent-name <name>   Agent name. Defaults to "assistant".
  --model <specifier>   Optional model specifier for generated agent files.
  --eve-mount <path>    Eve route mount. Defaults to "/eve/v1".
  --force               Overwrite generated files that contain the generated marker.
  --agent               Generate src/agents/<agent>.ts. Enabled by default.
  --tools               Adapt agent/tools/*.ts. Enabled by default.
  --connections         Adapt agent/connections/*.ts. Enabled by default.
  --sidecar             Generate src/flue-eve-shim.ts. Enabled by default.
  --app-mount           Inject mountEveCompat(app) into src/app.ts. Enabled by default.
  --no-agent            Do not generate src/agents/<agent>.ts.
  --no-tools            Do not adapt agent/tools/*.ts.
  --no-connections      Do not adapt agent/connections/*.ts.
  --no-sidecar          Do not generate src/flue-eve-shim.ts.
  --no-app-mount        Do not inject mountEveCompat(app) into src/app.ts.
  --help                Show this help.`);
    return;
  }

  printHelp();
}

main(process.argv.slice(2)).then(
  (code) => {
    exit(code);
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    exit(1);
  },
);
