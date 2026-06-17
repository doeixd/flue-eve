/**
 * Detach a long-running command; stream output to .tmp/bg-<label>.log.
 * Writes .tmp/bg-<label>.json with { pid, log, command, startedAt }.
 *
 *   node scripts/bg-run.mjs cloudflare-smoke -- vp exec -- node scripts/smoke-cloudflare-ci.mjs
 *   node scripts/bg-run.mjs wrangler-dev -- vp exec -- pnpm --filter @flue-eve/example-cloudflare-eve dev
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createWriteStream } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { resolveVpNode } from "./resolve-vp-node.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tmpDir = join(root, ".tmp");
mkdirSync(tmpDir, { recursive: true });

const label = process.argv[2];
const separator = process.argv.indexOf("--");
if (label === undefined || separator === -1 || separator === process.argv.length - 1) {
  console.error("Usage: node scripts/bg-run.mjs <label> -- <command> [args...]");
  process.exit(1);
}

let command = process.argv[separator + 1];
let args = process.argv.slice(separator + 2);

if (command === "vp" && args[0] === "exec" && args[1] === "--") {
  command = resolveVpNode(root);
  args = args.slice(2);
  if (args[0] === "node") {
    args = args.slice(1);
  }
}
const logPath = join(tmpDir, `bg-${label}.log`);
const manifestPath = join(tmpDir, `bg-${label}.json`);
const logStream = createWriteStream(logPath, { flags: "w" });

function stamp(line) {
  return `[${new Date().toISOString()}] ${line}`;
}

logStream.write(stamp(`starting: ${command} ${args.join(" ")}\n`));

const isWindows = process.platform === "win32";
const child = spawn(command, args, {
  cwd: root,
  detached: true,
  stdio: ["ignore", "pipe", "pipe"],
  shell: isWindows,
  env: process.env,
});

child.stdout?.on("data", (chunk) => logStream.write(chunk));
child.stderr?.on("data", (chunk) => logStream.write(chunk));
child.on("exit", (code) => {
  logStream.write(stamp(`exit code: ${code ?? 1}\n`));
  logStream.end();
});

child.unref();

writeFileSync(
  manifestPath,
  JSON.stringify(
    {
      pid: child.pid,
      label,
      log: logPath,
      command,
      args,
      startedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);

console.log(`[bg-run] ${label} pid=${child.pid}`);
console.log(`[bg-run] log: ${logPath}`);
console.log(`[bg-run] manifest: ${manifestPath}`);