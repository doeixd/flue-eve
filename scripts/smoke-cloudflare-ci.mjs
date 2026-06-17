/**
 * CI helper: start wrangler dev for cloudflare-eve, wait for health, run smoke, cleanup.
 * All wrangler output is tee'd to .tmp/smoke-cloudflare-wrangler.log.
 *
 *   vp exec -- node scripts/smoke-cloudflare-ci.mjs
 */
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createWriteStream } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { resolveVpNode } from "./resolve-vp-node.mjs";

const host = process.env.EVE_HOST ?? "http://127.0.0.1:8787";
const healthUrl = `${host}/eve/v1/health`;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tmpDir = join(root, ".tmp");
const exampleDir = join(root, "examples", "cloudflare-eve");
const smokeScript = join(exampleDir, "smoke.mjs");
const wranglerLogPath = join(tmpDir, "smoke-cloudflare-wrangler.log");
const resultPath = join(tmpDir, "smoke-cloudflare-result.json");
const timeoutMs = Number(process.env.EVE_SMOKE_TIMEOUT_MS ?? 90_000);

mkdirSync(tmpDir, { recursive: true });
writeFileSync(wranglerLogPath, `[${new Date().toISOString()}] smoke-cloudflare-ci starting\n`);

function log(line) {
  const stamped = `[${new Date().toISOString()}] ${line}\n`;
  appendFileSync(wranglerLogPath, stamped);
  console.log(line);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth() {
  const deadline = Date.now() + timeoutMs;
  let lastError = "timeout";

  while (Date.now() < deadline) {
    try {
      const response = await fetch(healthUrl);
      if (response.ok) {
        const body = await response.json();
        if (body?.ok === true && body?.status === "ready") return;
        lastError = `health not ready: ${JSON.stringify(body)}`;
      } else {
        lastError = `health status ${response.status}`;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(500);
  }

  throw new Error(`Timed out waiting for ${healthUrl}: ${lastError}`);
}

function spawnWrangler() {
  const wranglerJs = join(exampleDir, "node_modules", "wrangler", "bin", "wrangler.js");
  const logStream = createWriteStream(wranglerLogPath, { flags: "a" });

  const nodeBin = resolveVpNode(root);
  const child = spawn(nodeBin, [wranglerJs, "dev", "--port", "8787", "--ip", "127.0.0.1"], {
    cwd: exampleDir,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      CI: "true",
      WRANGLER_SEND_METRICS: "false",
      NO_COLOR: "1",
    },
    shell: false,
  });

  child.stdout?.on("data", (chunk) => logStream.write(chunk));
  child.stderr?.on("data", (chunk) => logStream.write(chunk));
  child.on("exit", (code) => {
    logStream.write(`\n[wrangler exit ${code ?? 1}]\n`);
    logStream.end();
  });

  return child;
}

function runSmoke() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [smokeScript], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, EVE_HOST: host },
      shell: false,
    });

    child.stdout?.on("data", (chunk) => {
      appendFileSync(wranglerLogPath, chunk);
      process.stdout.write(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      appendFileSync(wranglerLogPath, chunk);
      process.stderr.write(chunk);
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

function killProcess(child) {
  if (child.exitCode !== null || child.killed) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore", shell: true });
  } else {
    child.kill("SIGTERM");
  }
}

const wrangler = spawnWrangler();
let wranglerExited = false;
let wranglerExitCode = null;

wrangler.on("exit", (code) => {
  wranglerExited = true;
  wranglerExitCode = code ?? 1;
});

let exitCode = 1;
let errorMessage;

try {
  log(`[smoke:cloudflare-ci] waiting for ${healthUrl}`);
  log(`[smoke:cloudflare-ci] wrangler log: ${wranglerLogPath}`);
  await waitForHealth();
  if (wranglerExited) {
    throw new Error(`wrangler exited before health check (${wranglerExitCode})`);
  }
  log("[smoke:cloudflare-ci] health ready, running smoke");
  exitCode = await runSmoke();
  if (exitCode !== 0) {
    errorMessage = `smoke exited with code ${exitCode}`;
    log(`[smoke:cloudflare-ci] failed: ${errorMessage}`);
  } else {
    log("[smoke:cloudflare-ci] ok");
  }
} catch (error) {
  errorMessage = error instanceof Error ? error.message : String(error);
  log(`[smoke:cloudflare-ci] failed: ${errorMessage}`);
  exitCode = 1;
} finally {
  killProcess(wrangler);
  writeFileSync(
    resultPath,
    JSON.stringify(
      {
        ok: exitCode === 0,
        exitCode,
        error: errorMessage,
        wranglerLog: wranglerLogPath,
        finishedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  log(`[smoke:cloudflare-ci] result: ${resultPath}`);
}

process.exit(exitCode);
