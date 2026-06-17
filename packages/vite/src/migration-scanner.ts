import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import type { FlueProjectLayout } from "./paths.js";

export type MigrationTier = 0 | 1 | 2 | 3;

export interface MigrationFinding {
  readonly tier: MigrationTier;
  readonly file: string;
  readonly reason: string;
  readonly pattern: string;
}

export interface MigrationReport {
  readonly tier0: readonly MigrationFinding[];
  readonly tier1: readonly MigrationFinding[];
  readonly tier2: readonly MigrationFinding[];
  readonly tier3: readonly MigrationFinding[];
  readonly summary: {
    readonly tier0Count: number;
    readonly tier1Count: number;
    readonly tier2Count: number;
    readonly tier3Count: number;
    readonly estimatedEffort: "zero-touch" | "minimal" | "moderate" | "significant";
  };
}

const TIER_3_PATTERNS: ReadonlyArray<{ readonly pattern: RegExp; readonly reason: string }> = [
  { pattern: /from\s+["']@vercel\/workflow/, reason: "imports Vercel Workflow SDK" },
  { pattern: /from\s+["']eve\/(?!client\/|react\/|client["']|react["'])/, reason: "imports Eve runtime internals" },
  { pattern: /defineChannel|slackChannel|discordChannel/, reason: "defines an Eve platform channel" },
  { pattern: /defineSchedule|schedule\s*\(/, reason: "defines an Eve schedule" },
  { pattern: /vercelOidc|@vercel\/oidc/, reason: "uses Vercel OIDC helpers" },
  { pattern: /workflowEntry|workflow\.step/, reason: "uses Workflow SDK step semantics" },
];

export function scanMigration(layout: FlueProjectLayout): MigrationReport {
  const findings: MigrationFinding[] = [];

  const agentDir = join(layout.root, "agent");
  const hasAgentDir = existsSync(agentDir);
  const instructionsPath = join(agentDir, "instructions.md");
  const hasInstructions = existsSync(instructionsPath);

  scanForEveImports(layout.sourceDir, findings);
  scanSourceFiles(layout.sourceDir, findings);

  if (hasAgentDir) {
    scanAgentFiles(agentDir, findings);
    const toolsDir = getAgentToolsDir(layout);
    if (existsSync(toolsDir)) scanToolFiles(toolsDir, findings);
    const connectionsDir = getAgentConnectionsDir(layout);
    if (existsSync(connectionsDir)) scanConnectionFiles(connectionsDir, findings);
    if (hasInstructions) {
      findings.push({
        tier: 1,
        file: instructionsPath,
        reason: "found agent/instructions.md",
        pattern: "instructions",
      });
    }
    scanConfigFile(layout.root, findings);
  }

  const tier0 = findings.filter((f) => f.tier === 0);
  const tier1 = findings.filter((f) => f.tier === 1);
  const tier2 = findings.filter((f) => f.tier === 2);
  const tier3 = findings.filter((f) => f.tier === 3);

  const effort =
    tier3.length > 0
      ? "significant"
      : tier2.length > 0
        ? "moderate"
        : tier1.length > 0
          ? "minimal"
          : "zero-touch";

  return {
    tier0,
    tier1,
    tier2,
    tier3,
    summary: {
      tier0Count: tier0.length,
      tier1Count: tier1.length,
      tier2Count: tier2.length,
      tier3Count: tier3.length,
      estimatedEffort: effort,
    },
  };
}

export function isStrictMigrationBlocked(report: MigrationReport): boolean {
  return report.tier2.length > 0 || report.tier3.length > 0;
}

export function formatMigrationReport(report: MigrationReport): string {
  const lines: string[] = [];
  const { summary } = report;

  lines.push(`[flue-eve] Migration scan complete. Estimated effort: ${summary.estimatedEffort}`);
  lines.push(
    `  Tier 0 (frontend-only): ${summary.tier0Count}   Tier 1 (declarative): ${summary.tier1Count}`,
  );
  lines.push(
    `  Tier 2 (assisted):     ${summary.tier2Count}   Tier 3 (gap):        ${summary.tier3Count}`,
  );

  for (const finding of report.tier3) {
    lines.push(`  [Tier 3] ${finding.file}: ${finding.reason}`);
  }
  for (const finding of report.tier2) {
    lines.push(`  [Tier 2] ${finding.file}: ${finding.reason}`);
  }

  if (report.tier3.length > 0) {
    lines.push("  Tier 3 items require a manual port or waiting for compatibility surface support.");
  }

  return lines.join("\n");
}

function scanForEveImports(sourceDir: string, findings: MigrationFinding[]): void {
  const files = listTsFiles(sourceDir);
  for (const file of files) {
    const source = readFileSafe(file);
    if (source === undefined) continue;
    if (/from\s+["']eve\/client["']/.test(source) || /from\s+["']eve\/react["']/.test(source)) {
      findings.push({
        tier: 0,
        file,
        reason: "imports eve/client or eve/react — alias maps to flue-eve",
        pattern: "eve-import",
      });
    }
  }
}

function scanSourceFiles(sourceDir: string, findings: MigrationFinding[]): void {
  const files = listTsFiles(sourceDir);
  for (const file of files) {
    const source = readFileSafe(file);
    if (source === undefined) continue;
    const tier3 = detectTier3(source);
    if (tier3 !== undefined) {
      findings.push({ tier: 3, file, ...tier3 });
    }
  }
}

function scanAgentFiles(dir: string, findings: MigrationFinding[]): void {
  const files = safeReaddir(dir)
    .filter((entry) => entry.endsWith(".ts") && statSafe(join(dir, entry))?.isFile())
    .map((entry) => join(dir, entry));
  for (const file of files) {
    const source = readFileSafe(file);
    if (source === undefined) continue;
    const tier3 = detectTier3(source);
    if (tier3 !== undefined) {
      findings.push({ tier: 3, file, ...tier3 });
    }
  }
}

function scanToolFiles(dir: string, findings: MigrationFinding[]): void {
  const files = listTsFiles(dir);
  for (const file of files) {
    const source = readFileSafe(file);
    if (source === undefined) continue;

    const tier3 = detectTier3(source);
    if (tier3 !== undefined) {
      findings.push({ tier: 3, file, ...tier3 });
      continue;
    }

    if (isSupportedTool(source)) {
      findings.push({
        tier: 1,
        file,
        reason: "supported tool — can generate Flue adapter",
        pattern: "tool-default-export",
      });
    } else {
      findings.push({
        tier: 2,
        file,
        reason: "tool needs manual review — unsupported pattern (use export default { ... execute })",
        pattern: "tool-unsupported",
      });
    }
  }
}

function scanConnectionFiles(dir: string, findings: MigrationFinding[]): void {
  const files = listTsFiles(dir);
  for (const file of files) {
    const source = readFileSafe(file);
    if (source === undefined) continue;

    const tier3 = detectTier3(source);
    if (tier3 !== undefined) {
      findings.push({ tier: 3, file, ...tier3 });
      continue;
    }

    if (isSupportedConnection(source)) {
      findings.push({
        tier: 1,
        file,
        reason: "supported connection — can generate registry entry",
        pattern: "connection-default-export",
      });
    } else {
      findings.push({
        tier: 2,
        file,
        reason: "connection needs manual review — unsupported pattern",
        pattern: "connection-unsupported",
      });
    }
  }
}

function scanConfigFile(root: string, findings: MigrationFinding[]): void {
  for (const name of ["eve.config.ts", "eve.config.mts", "eve.config.js", "eve.config.mjs"]) {
    const path = join(root, name);
    if (!existsSync(path)) continue;
    findings.push({
      tier: 1,
      file: path,
      reason: "detected eve.config file",
      pattern: "eve-config",
    });
    break;
  }
}

function detectTier3(
  source: string,
): { readonly reason: string; readonly pattern: string } | undefined {
  for (const entry of TIER_3_PATTERNS) {
    if (entry.pattern.test(source)) {
      return { reason: entry.reason, pattern: "tier-3" };
    }
  }
  return undefined;
}

function isSupportedTool(source: string): boolean {
  return /export\s+default\s*\{/.test(source) && /execute\s*:/.test(source);
}

function isSupportedConnection(source: string): boolean {
  return (
    /defineMcpClientConnection/.test(source) ||
    /defineOpenAPIConnection/.test(source) ||
    (/export\s+default\s*\{/.test(source) && /url\s*:/.test(source))
  );
}

function getAgentToolsDir(layout: FlueProjectLayout): string {
  return layout.agentToolsDir ?? join(layout.root, "agent", "tools");
}

function getAgentConnectionsDir(layout: FlueProjectLayout): string {
  return layout.agentConnectionsDir ?? join(layout.root, "agent", "connections");
}

function listTsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return safeReaddir(dir)
    .filter((entry) => entry.endsWith(".ts") || entry.endsWith(".tsx") || entry.endsWith(".jsx"))
    .map((entry) => join(dir, entry));
}

function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function readFileSafe(file: string): string | undefined {
  try {
    if (!statSync(file).isFile()) return undefined;
    return readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
}

function statSafe(path: string): ReturnType<typeof statSync> | undefined {
  try {
    return statSync(path);
  } catch {
    return undefined;
  }
}
