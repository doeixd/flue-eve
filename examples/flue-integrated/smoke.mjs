import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const host = process.env.EVE_HOST ?? "http://127.0.0.1:3583";
const script = join(dirname(fileURLToPath(import.meta.url)), "../../scripts/smoke-eve.mjs");

const child = spawn(process.execPath, [script], {
  stdio: "inherit",
  env: { ...process.env, EVE_HOST: host },
});

const code = await new Promise((resolve) => {
  child.on("exit", (exitCode) => resolve(exitCode ?? 1));
});

process.exit(code);