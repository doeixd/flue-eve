import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Node binary for long-running scripts. Prefers the current process when already
 * on Node >=22 (e.g. under `vp exec`), otherwise resolves vite-plus's pinned runtime.
 */
export function resolveVpNode(root = process.cwd()) {
  const major = Number(process.versions.node.split(".")[0] ?? "0");
  if (major >= 22) return process.execPath;

  try {
    const version = readFileSync(join(root, ".node-version"), "utf8").trim();
    const name = process.platform === "win32" ? "node.exe" : "node";
    const candidate = join(homedir(), ".vite-plus", "js_runtime", "node", version, name);
    if (existsSync(candidate)) return candidate;
  } catch {
    // fall through
  }

  return process.execPath;
}