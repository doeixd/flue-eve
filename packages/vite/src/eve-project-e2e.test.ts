import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveFlueProjectLayout } from "./paths.js";
import { runScaffold } from "./scaffold.js";

const hasFlueRuntime = tryResolve("@flue/runtime") !== undefined;

function tryResolve(id: string): string | undefined {
  try {
    return createRequire(join(process.cwd(), "package.json")).resolve(id);
  } catch {
    return undefined;
  }
}

describe("Eve project running on Flue scaffold", () => {
  it("M8-12: generates correct Flue agent files from Eve-like source layout", async () => {
    const root = mkdtempSync(join(process.cwd(), ".tmp", "flue-eve-e2e-"));
    mkdirSync(join(root, "src"), { recursive: true });
    mkdirSync(join(root, "agent", "tools"), { recursive: true });
    mkdirSync(join(root, "agent", "connections"), { recursive: true });

    writeFileSync(
      join(root, "src", "app.ts"),
      `import { Hono } from "hono";\nconst app = new Hono();\nexport default app;\n`,
      "utf8",
    );
    writeFileSync(
      join(root, "agent", "instructions.md"),
      "You are an Eve-authored order support agent running on Flue.\n",
      "utf8",
    );
    writeFileSync(
      join(root, "agent", "tools", "lookup-order.ts"),
      `export default {
  name: "lookup_order",
  description: "Look up an order",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: { orderId: { type: "string" } },
    required: ["orderId"],
  },
  execute: async (input: { orderId: string }) => ({ status: "packed", orderId: input.orderId }),
};\n`,
      "utf8",
    );
    writeFileSync(
      join(root, "agent", "connections", "linear.ts"),
      `export default {
  url: "https://mcp.linear.example.com",
  description: "Linear issue tracker",
  tools: [
    {
      name: "list_issues",
      description: "List Linear issues",
      qualifiedName: "connection__linear__list_issues",
    },
  ],
};\n`,
      "utf8",
    );

    const layout = resolveFlueProjectLayout(root);
    const result = runScaffold({
      layout,
      config: {
        agentName: "assistant",
        eveMount: "/eve/v1",
        modelId: "anthropic/claude-sonnet-4-6",
      },
      agent: true,
      tools: true,
      connections: true,
      sidecar: true,
      appMount: true,
      forceScaffold: true,
    });

    expect(result.warnings).toEqual([]);
    expect(result.created).toEqual(
      expect.arrayContaining([
        join(root, "src", "agents", "assistant.ts"),
        join(root, "src", "tools", "lookup-order.ts"),
        join(root, "src", "connections", "index.ts"),
        join(root, "src", "flue-eve-shim.ts"),
        join(root, "src", "app.ts"),
      ]),
    );

    const sidecarSource = readFileSync(join(root, "src", "flue-eve-shim.ts"), "utf8");
    expect(sidecarSource).toContain('from "@flue-eve/compat-server"');
    expect(sidecarSource).toContain("connections: connectionRegistry");
    expect(sidecarSource).not.toContain("@flue/runtime/internal");

    const agentSource = readFileSync(join(root, "src", "agents", "assistant.ts"), "utf8");
    expect(agentSource).toContain("Eve-authored order support agent");
    expect(agentSource).toContain('import lookup_order from "../tools/lookup-order.ts"');
    expect(agentSource).toContain("tools: [lookup_order]");

    const connectionsSource = readFileSync(join(root, "src", "connections", "index.ts"), "utf8");
    expect(connectionsSource).toContain('defineFlueConnection(toFlueConnection("linear"');
    expect(connectionsSource).toContain('from "@flue-eve/connections"');
  });

  it.runIf(hasFlueRuntime)(
    "M8-12: loads generated Flue app and serves Eve endpoints at runtime",
    async () => {
      const root = mkdtempSync(join(process.cwd(), ".tmp", "flue-eve-e2e-runtime-"));
      mkdirSync(join(root, "src"), { recursive: true });
      mkdirSync(join(root, "agent"), { recursive: true });

      writeFileSync(
        join(root, "src", "app.ts"),
        `import { Hono } from "hono";\nconst app = new Hono();\nexport default app;\n`,
        "utf8",
      );
      writeFileSync(
        join(root, "agent", "instructions.md"),
        "You are an agent.\n",
        "utf8",
      );

      const layout = resolveFlueProjectLayout(root);
      runScaffold({
        layout,
        config: { agentName: "assistant", eveMount: "/eve/v1" },
        agent: true,
        sidecar: true,
        appMount: true,
        forceScaffold: true,
      });

      const mod = (await import(
        `${join(root, "src", "app.ts").replace(/\\/g, "/")}`
      )) as { default: { fetch: (req: Request) => Promise<Response> } };
      const app = mod.default;

      const health = await (await app.fetch(new Request("http://localhost/eve/v1/health"))).json() as {
        ok: boolean;
        status: string;
        agentName: string;
      };
      expect(health).toMatchObject({ ok: true, status: "ready", agentName: "assistant" });

      const info = await (await app.fetch(new Request("http://localhost/eve/v1/info"))).json() as {
        tools: Array<{ name: string }>;
      };
      expect(info.tools.map((tool) => tool.name)).toEqual(
        expect.arrayContaining(["connection__search"]),
      );

      const start = await app.fetch(
        new Request("http://localhost/eve/v1/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: "Hello" }),
        }),
      );
      expect(start.status).toBe(202);
    },
  );
});
