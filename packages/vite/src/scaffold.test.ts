import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  GENERATED_MARKER,
  INJECTED_MARKER,
  injectAppMount,
  renderAgent,
  renderConnectionRegistry,
  renderGeneratedTool,
  renderSidecar,
  resolveInstructionsFromProject,
  runConnectionCodegen,
  runToolCodegen,
  runScaffold,
} from "./scaffold.js";

const tempDirs: string[] = [];

afterEach(() => {
  tempDirs.length = 0;
});

describe("runScaffold", () => {
  it("creates sidecar once and skips on second run", () => {
    const root = makeProjectRoot();
    const layout = {
      root,
      sourceDir: join(root, "src"),
      appFile: join(root, "src", "app.ts"),
      shimFile: join(root, "src", "flue-eve-shim.ts"),
      agentsDir: join(root, "src", "agents"),
      agentToolsDir: join(root, "agent", "tools"),
      toolsDir: join(root, "src", "tools"),
    };

    const first = runScaffold({
      layout,
      config: { agentName: "assistant", eveMount: "/eve/v1" },
      sidecar: true,
    });
    const second = runScaffold({
      layout,
      config: { agentName: "assistant", eveMount: "/eve/v1" },
      sidecar: true,
    });

    expect(first.created).toContain(layout.shimFile);
    expect(second.skipped).toContain(layout.shimFile);
    expect(readFileSync(layout.shimFile, "utf8")).toContain("mountEveCompat");
  });

  it("injects app mount idempotently", () => {
    const root = makeProjectRoot();
    const appFile = join(root, "src", "app.ts");
    const shimFile = join(root, "src", "flue-eve-shim.ts");

    expect(injectAppMount(appFile, shimFile)).toBe("created");
    const updated = readFileSync(appFile, "utf8");
    expect(updated).toContain(INJECTED_MARKER);
    expect(updated).toContain('import { mountEveCompat } from "./flue-eve-shim.ts"');
    expect(updated).toContain("mountEveCompat(app);");
    expect(updated).toContain("export default app");

    expect(injectAppMount(appFile, shimFile)).toBe("skipped");
  });
});

describe("renderSidecar", () => {
  it("includes generated marker and compat mount", () => {
    const source = renderSidecar({ agentName: "assistant", eveMount: "/eve/v1" });
    expect(source).toContain("@flue-eve/generated");
    expect(source).toContain('eveMount: "/eve/v1"');
    expect(source).toContain('from "@flue-eve/compat-server"');
    expect(source).toContain("resolveAdmissionFromRuntime");
    expect(source).toContain("resolveEveCompatDefaults");
  });

  it("imports the connection registry when connections are enabled", () => {
    const source = renderSidecar({
      agentName: "assistant",
      eveMount: "/eve/v1",
      connections: true,
    });
    expect(source).toContain('import { connectionRegistry } from "./connections/index.ts"');
    expect(source).toContain("connections: connectionRegistry");
  });
});

describe("resolveInstructionsFromProject", () => {
  it("reads agent/instructions.md from the project root", () => {
    const root = makeProjectRoot();
    mkdirSync(join(root, "agent"), { recursive: true });
    writeFileSync(join(root, "agent/instructions.md"), "You are a precise assistant.\n", "utf8");

    expect(
      resolveInstructionsFromProject({
        root,
        sourceDir: join(root, "src"),
        appFile: join(root, "src", "app.ts"),
        shimFile: join(root, "src", "flue-eve-shim.ts"),
        agentsDir: join(root, "src", "agents"),
        agentToolsDir: join(root, "agent", "tools"),
        toolsDir: join(root, "src", "tools"),
      }),
    ).toBe("You are a precise assistant.");
  });
});

describe("runScaffold instructions", () => {
  it("inlines instructions.md into a generated agent module", () => {
    const root = makeProjectRoot();
    mkdirSync(join(root, "agent"), { recursive: true });
    writeFileSync(join(root, "agent/instructions.md"), "Always cite sources.\n", "utf8");

    const layout = {
      root,
      sourceDir: join(root, "src"),
      appFile: join(root, "src", "app.ts"),
      shimFile: join(root, "src", "flue-eve-shim.ts"),
      agentsDir: join(root, "src", "agents"),
      agentToolsDir: join(root, "agent", "tools"),
      toolsDir: join(root, "src", "tools"),
    };

    const result = runScaffold({
      layout,
      config: { agentName: "assistant", eveMount: "/eve/v1" },
      agent: true,
    });

    const agentFile = join(layout.agentsDir, "assistant.ts");
    expect(result.created).toContain(agentFile);
    expect(readFileSync(agentFile, "utf8")).toContain("Always cite sources.");
    expect(renderAgent({ agentName: "assistant", eveMount: "/eve/v1" })).not.toContain(
      "Always cite sources.",
    );
  });
});

describe("runToolCodegen", () => {
  it("generates Flue tool adapters from agent/tools files", () => {
    const root = makeProjectRoot();
    const agentToolsDir = join(root, "agent", "tools");
    mkdirSync(agentToolsDir, { recursive: true });
    writeFileSync(
      join(agentToolsDir, "lookup-order.ts"),
      `export default { name: "lookup_order", description: "Lookup an order", parameters: {}, execute: async () => "ok" };\n`,
      "utf8",
    );

    const layout = {
      root,
      sourceDir: join(root, "src"),
      appFile: join(root, "src", "app.ts"),
      shimFile: join(root, "src", "flue-eve-shim.ts"),
      agentsDir: join(root, "src", "agents"),
      agentToolsDir,
      toolsDir: join(root, "src", "tools"),
    };

    const result = runToolCodegen(layout);
    const generated = join(layout.toolsDir, "lookup-order.ts");
    expect(result.created).toContain(generated);
    const source = readFileSync(generated, "utf8");
    expect(source).toContain(GENERATED_MARKER);
    expect(source).toContain('import toolModule from "../../agent/tools/lookup-order.ts"');
    expect(source).toContain('name: source.name ?? "lookup-order"');
  });

  it("renders generated tools in the agent module", () => {
    const source = renderAgent(
      { agentName: "assistant", eveMount: "/eve/v1" },
      ["./lookup-order.ts", "./weather.ts"],
    );
    expect(source).toContain('import lookup_order from "./lookup-order.ts"');
    expect(source).toContain('import weather from "./weather.ts"');
    expect(source).toContain("tools: [lookup_order, weather]");
  });

  it("renders a tool adapter from a source path", () => {
    const rendered = renderGeneratedTool(
      "/project/src/tools/lookup-order.ts",
      "/project/agent/tools/lookup-order.ts",
    );
    expect(rendered).toContain(GENERATED_MARKER);
    expect(rendered).toContain('import toolModule from "../../agent/tools/lookup-order.ts"');
  });
});

describe("runConnectionCodegen", () => {
  it("generates a connection registry from agent/connections files", () => {
    const root = makeProjectRoot();
    const agentConnectionsDir = join(root, "agent", "connections");
    mkdirSync(agentConnectionsDir, { recursive: true });
    writeFileSync(
      join(agentConnectionsDir, "linear.ts"),
      `export default { name: "linear", description: "Linear workspace", url: "https://mcp.linear.app" };\n`,
      "utf8",
    );

    const layout = {
      root,
      sourceDir: join(root, "src"),
      appFile: join(root, "src", "app.ts"),
      shimFile: join(root, "src", "flue-eve-shim.ts"),
      agentsDir: join(root, "src", "agents"),
      agentToolsDir: join(root, "agent", "tools"),
      agentConnectionsDir,
      toolsDir: join(root, "src", "tools"),
      connectionsDir: join(root, "src", "connections"),
    };

    const result = runConnectionCodegen(layout);
    const generated = join(layout.connectionsDir, "index.ts");
    expect(result.created).toContain(generated);
    const source = readFileSync(generated, "utf8");
    expect(source).toContain(GENERATED_MARKER);
    expect(source).toContain('from "@flue-eve/connections"');
    expect(source).toContain('import linear from "../../agent/connections/linear.ts"');
  });

  it("renders a connection registry module", () => {
    const rendered = renderConnectionRegistry([
      { name: "linear", path: "../../agent/connections/linear.ts" },
    ]);
    expect(rendered).toContain(GENERATED_MARKER);
    expect(rendered).toContain('import linear from "../../agent/connections/linear.ts"');
  });

  it("processes defineMcpClientConnection source patterns", () => {
    const root = makeProjectRoot();
    const agentConnectionsDir = join(root, "agent", "connections");
    mkdirSync(agentConnectionsDir, { recursive: true });
    writeFileSync(
      join(agentConnectionsDir, "linear-mcp.ts"),
      [
        `import { defineMcpClientConnection } from "@flue-eve/connections";`,
        `export default defineMcpClientConnection({`,
        `  name: "linear",`,
        `  description: "Linear MCP workspace",`,
        `  mcp: { url: "https://mcp.linear.app" },`,
        `});`,
      ].join("\n"),
      "utf8",
    );

    const layout = {
      root,
      sourceDir: join(root, "src"),
      appFile: join(root, "src", "app.ts"),
      shimFile: join(root, "src", "flue-eve-shim.ts"),
      agentsDir: join(root, "src", "agents"),
      agentToolsDir: join(root, "agent", "tools"),
      agentConnectionsDir,
      toolsDir: join(root, "src", "tools"),
      connectionsDir: join(root, "src", "connections"),
    };

    const result = runConnectionCodegen(layout);
    const generated = join(layout.connectionsDir, "index.ts");
    expect(result.created).toContain(generated);
    const source = readFileSync(generated, "utf8");
    expect(source).toContain(GENERATED_MARKER);
    expect(source).toContain('import linear_mcp from "../../agent/connections/linear-mcp.ts"');
    expect(source).toContain("defineFlueConnection(toFlueConnection(\"linear_mcp\"");
  });

  it("skips unsupported connection source patterns with a warning", () => {
    const root = makeProjectRoot();
    const agentConnectionsDir = join(root, "agent", "connections");
    mkdirSync(agentConnectionsDir, { recursive: true });
    writeFileSync(
      join(agentConnectionsDir, "custom.ts"),
      `export const handler = () => {};\n`,
      "utf8",
    );

    const layout = {
      root,
      sourceDir: join(root, "src"),
      appFile: join(root, "src", "app.ts"),
      shimFile: join(root, "src", "flue-eve-shim.ts"),
      agentsDir: join(root, "src", "agents"),
      agentToolsDir: join(root, "agent", "tools"),
      agentConnectionsDir,
      toolsDir: join(root, "src", "tools"),
      connectionsDir: join(root, "src", "connections"),
    };

    const result = runConnectionCodegen(layout);
    expect(result.created).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("unsupported connection pattern");
  });
});

function makeProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "flue-eve-vite-"));
  tempDirs.push(root);
  const src = join(root, "src");
  mkdirSync(src, { recursive: true });
  writeFileSync(
    join(src, "app.ts"),
    `import { Hono } from "hono";\nconst app = new Hono();\nexport default app;\n`,
    "utf8",
  );
  return root;
}
