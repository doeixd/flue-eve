import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  formatMigrationReport,
  isStrictMigrationBlocked,
  scanMigration,
} from "./migration-scanner.js";
import { resolveFlueProjectLayout } from "./paths.js";

function makeProject(files: Record<string, string>): string {
  const root = mkdtempSync(join(process.cwd(), ".tmp", "flue-eve-migration-"));
  for (const [relative, content] of Object.entries(files)) {
    const full = join(root, ...relative.split("/"));
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content, "utf8");
  }
  mkdirSync(join(root, "src"), { recursive: true });
  return root;
}

describe("scanMigration", () => {
  it("classifies frontend-only as Tier 0 zero-touch", () => {
    const root = makeProject({
      "src/app.ts": `import { useEveAgent } from "eve/react";\nexport default () => null;\n`,
    });
    const layout = resolveFlueProjectLayout(root);
    const report = scanMigration(layout);
    expect(report.summary.estimatedEffort).toBe("zero-touch");
    expect(report.summary.tier0Count).toBeGreaterThanOrEqual(1);
    expect(report.summary.tier3Count).toBe(0);
    expect(report.tier0.some((f) => f.pattern === "eve-import")).toBe(true);
  });

  it("classifies simple agent as Tier 1 minimal", () => {
    const root = makeProject({
      "agent/instructions.md": "You are helpful.\n",
      "agent/tools/lookup.ts": `export default { name: "lookup", description: "Look up", execute: async () => {} };\n`,
      "agent/connections/linear.ts": `export default { url: "https://mcp.linear.example.com", description: "Linear" };\n`,
    });
    const layout = resolveFlueProjectLayout(root);
    const report = scanMigration(layout);
    expect(report.summary.estimatedEffort).toBe("minimal");
    expect(report.summary.tier1Count).toBeGreaterThanOrEqual(1);
    expect(report.summary.tier3Count).toBe(0);
  });

  it("classifies unsupported tool as Tier 2", () => {
    const root = makeProject({
      "agent/instructions.md": "Hello\n",
      "agent/tools/dynamic.ts": `export const myTool = { name: "dynamic" };\n`,
    });
    const layout = resolveFlueProjectLayout(root);
    const report = scanMigration(layout);
    expect(report.tier2).toHaveLength(1);
    expect(report.tier2[0].pattern).toBe("tool-unsupported");
    expect(report.summary.estimatedEffort).toBe("moderate");
  });

  it("classifies Workflow SDK import as Tier 3", () => {
    const root = makeProject({
      "agent/instructions.md": "Hello\n",
      "agent/tools/workflow.ts": `import { workflowEntry } from "@vercel/workflow";\nexport default { execute: async () => {} };\n`,
    });
    const layout = resolveFlueProjectLayout(root);
    const report = scanMigration(layout);
    expect(report.tier3.length).toBeGreaterThanOrEqual(1);
    expect(report.summary.estimatedEffort).toBe("significant");
    expect(isStrictMigrationBlocked(report)).toBe(true);
  });

  it("classifies eve runtime internal import as Tier 3", () => {
    const root = makeProject({
      "src/legacy.ts": `import { EveRuntime } from "eve/internal/runtime";\n`,
    });
    const layout = resolveFlueProjectLayout(root);
    const report = scanMigration(layout);
    expect(report.tier3.length).toBeGreaterThanOrEqual(1);
  });

  it("classifies platform channel code as Tier 3", () => {
    const root = makeProject({
      "agent/slack.ts": `export const slack = defineChannel({ name: "slack" });\n`,
    });
    const layout = resolveFlueProjectLayout(root);
    const report = scanMigration(layout);
    expect(report.tier3.length).toBeGreaterThanOrEqual(1);
  });

  it("classifies eve.config.ts as Tier 1", () => {
    const root = makeProject({
      "agent/instructions.md": "Hello\n",
      "eve.config.ts": `export default { agentName: "assistant" };\n`,
    });
    const layout = resolveFlueProjectLayout(root);
    const report = scanMigration(layout);
    expect(report.tier1.some((f) => f.pattern === "eve-config")).toBe(true);
  });

  it("returns zero-touch for empty source dir", () => {
    const root = makeProject({});
    const layout = resolveFlueProjectLayout(root);
    const report = scanMigration(layout);
    expect(report.summary.estimatedEffort).toBe("zero-touch");
    expect(report.tier3).toHaveLength(0);
  });

  it("handles missing agent dir gracefully", () => {
    const root = makeProject({
      "src/app.ts": `import { Client } from "eve/client";\n`,
    });
    const layout = resolveFlueProjectLayout(root);
    const report = scanMigration(layout);
    expect(report.summary.estimatedEffort).toBe("zero-touch");
    expect(report.tier0.some((f) => f.pattern === "eve-import")).toBe(true);
  });

  it("classifies connection with defineMcpClientConnection as Tier 1", () => {
    const root = makeProject({
      "agent/connections/linear.ts": `export default { defineMcpClientConnection: true, url: "https://example.com" };\n`,
    });
    const layout = resolveFlueProjectLayout(root);
    const report = scanMigration(layout);
    expect(report.tier1.some((f) => f.file.endsWith("linear.ts"))).toBe(true);
  });
});

describe("formatMigrationReport", () => {
  it("produces human-readable report with tiers", () => {
    const root = makeProject({
      "agent/instructions.md": "Hello\n",
      "agent/tools/lookup.ts": `export default { name: "lookup", execute: async () => {} };\n`,
    });
    const layout = resolveFlueProjectLayout(root);
    const report = scanMigration(layout);
    const text = formatMigrationReport(report);
    expect(text).toContain("[flue-eve] Migration scan complete");
    expect(text).toContain("Tier 0");
    expect(text).toContain("Tier 1");
    expect(text).toContain("Tier 2");
    expect(text).toContain("Tier 3");
  });

  it("shows tier 3 items in report output", () => {
    const root = makeProject({
      "agent/schedules.ts": `import { schedule } from "@vercel/workflow";\n`,
    });
    const layout = resolveFlueProjectLayout(root);
    const report = scanMigration(layout);
    const text = formatMigrationReport(report);
    expect(text).toContain("[Tier 3]");
  });
});

describe("isStrictMigrationBlocked", () => {
  it("returns false for zero-touch migration", () => {
    const root = makeProject({});
    const layout = resolveFlueProjectLayout(root);
    expect(isStrictMigrationBlocked(scanMigration(layout))).toBe(false);
  });

  it("returns true when tier 3 findings exist", () => {
    const root = makeProject({
      "src/workflow.ts": `import { workflowEntry } from "@vercel/workflow";\n`,
    });
    const layout = resolveFlueProjectLayout(root);
    expect(isStrictMigrationBlocked(scanMigration(layout))).toBe(true);
  });

  it("returns true when tier 2 findings exist", () => {
    const root = makeProject({
      "agent/instructions.md": "Hello\n",
      "agent/tools/dynamic.ts": `export const tool = {};\n`,
    });
    const layout = resolveFlueProjectLayout(root);
    expect(isStrictMigrationBlocked(scanMigration(layout))).toBe(true);
  });
});
