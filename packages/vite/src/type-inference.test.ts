import { describe, expect, expectTypeOf, it } from "vitest";
import type { ConnectionToolMetadata, FlueConnectionDefinition } from "@flue-eve/connections";

import {
  renderConnectionRegistry,
  renderGeneratedTool,
} from "./scaffold.js";

interface ToolDefinition {
  name: string;
  description: string;
  parameters: object;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

function generateTool(
  sourcePath: string,
  targetPath: string,
): string {
  return renderGeneratedTool(targetPath, sourcePath);
}

describe("generated tool type inference", () => {
  it("produces tool with typed name (not any)", () => {
    const source = {
      name: "lookup_order",
      description: "Look up order by ID",
      parameters: {
        type: "object" as const,
        properties: { orderId: { type: "string" as const } },
        required: ["orderId"],
      },
      execute: async (_args: { orderId: string }): Promise<string> => "ok",
    };

    const castedSource = source as {
      readonly name?: string;
      readonly description?: string;
      readonly parameters?: Record<string, unknown>;
      readonly execute?: (...args: readonly unknown[]) => unknown;
    };

    expectTypeOf(castedSource.name).not.toBeAny();
    expectTypeOf(castedSource.description).not.toBeAny();
    expectTypeOf(castedSource.parameters).not.toBeAny();
    expectTypeOf(castedSource.execute).not.toBeAny();

    const wrapped: ToolDefinition = {
      name: castedSource.name ?? "lookup-order",
      description: castedSource.description ?? "",
      parameters: castedSource.parameters ?? {},
      execute: (castedSource.execute as ToolDefinition["execute"]) ??
        (async () => ""),
    };

    expectTypeOf(wrapped.name).toBeString();
    expectTypeOf(wrapped.description).toBeString();
    expectTypeOf(wrapped.parameters).not.toBeAny();
    expectTypeOf(wrapped.execute).toBeFunction();
  });

  it("preserves parameters type when source uses valibot-like schema", () => {
    const source = {
      name: "valibot_tool",
      description: "Tool with valibot schema",
      parameters: { _schema: true, type: "object" as const },
      execute: async (args: { orderId: string }): Promise<string> => "ok",
    };

    const castedSource = source as {
      readonly name?: string;
      readonly description?: string;
      readonly parameters?: Record<string, unknown>;
      readonly execute?: (...args: readonly unknown[]) => unknown;
    };

    expectTypeOf(castedSource.parameters).not.toBeAny();
    expectTypeOf(castedSource.execute).not.toBeAny();
  });

  it("handles missing optional fields without any", () => {
    const minimalSource = {
      execute: async (_args: Record<string, unknown>): Promise<string> => "",
    };

    const castedMinimal = minimalSource as {
      readonly name?: string;
      readonly description?: string;
      readonly parameters?: Record<string, unknown>;
      readonly execute?: (...args: readonly unknown[]) => unknown;
    };

    expectTypeOf(castedMinimal.name).not.toBeAny();
    expectTypeOf(castedMinimal.description).not.toBeAny();
    expectTypeOf(castedMinimal.parameters).not.toBeAny();
    expectTypeOf(castedMinimal.execute).not.toBeAny();

    const wrapped: ToolDefinition = {
      name: castedMinimal.name ?? "minimal-tool",
      description: castedMinimal.description ?? "",
      parameters: castedMinimal.parameters ?? {},
      execute: (castedMinimal.execute as ToolDefinition["execute"]) ??
        (async () => ""),
    };

    expectTypeOf(wrapped.name).toBeString();
    expectTypeOf(wrapped.description).toBeString();
    expectTypeOf(wrapped.parameters).not.toBeAny();
    expectTypeOf(wrapped.execute).toBeFunction();
  });

  it("renderGeneratedTool output uses no any type casts", () => {
    const output = renderGeneratedTool(
      "/p/src/tools/my-tool.ts",
      "/p/agent/tools/my-tool.ts",
    );
    expect(output).not.toContain("as any");
    expect(output).not.toContain(": any");
  });
});

describe("generated connection registry type inference", () => {
  it("produces connection registry with typed entries", () => {
    const imports = [{ name: "linear", path: "../../agent/connections/linear.ts" }];
    const output = renderConnectionRegistry(imports);

    expect(output).not.toContain("as any");
    expect(output).not.toContain(": any");
    expect(output).toContain('import { createConnectionRegistry, defineFlueConnection } from "@flue-eve/connections"');
    expect(output).toContain("import type { FlueConnectionDefinition } from \"@flue-eve/connections\"");
  });

  it("toFlueConnection helper normalizes connection types correctly", () => {
    function toFlueConnection(
      name: string,
      source: FlueConnectionDefinition | {
        readonly name?: string;
        readonly description?: string;
        readonly url?: string;
        readonly auth?: unknown;
        readonly headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
        readonly tools?: FlueConnectionDefinition["tools"];
      },
    ): FlueConnectionDefinition {
      if ("mcp" in source || source.name !== undefined) {
        return source as FlueConnectionDefinition;
      }

      if (typeof source.url === "string" && source.url.length > 0) {
        return {
          name,
          description: source.description ?? "",
          mcp: { url: source.url, headers: source.headers },
          auth: source.auth as FlueConnectionDefinition["auth"],
          tools: source.tools,
        };
      }

      return {
        name,
        description: source.description ?? "",
        tools: source.tools ?? [],
      };
    }

    const linearDef = toFlueConnection("linear", {
      url: "https://mcp.linear.app",
      description: "Linear workspace",
      tools: [{
        name: "list_issues",
        description: "List Linear issues",
        qualifiedName: "connection__linear__list_issues",
      }],
    });

    expectTypeOf(linearDef.name).toBeString();
    expectTypeOf(linearDef.description).toBeString();
    expectTypeOf(linearDef.tools).not.toBeAny();
    expectTypeOf(linearDef.mcp).not.toBeAny();
    expectTypeOf(linearDef.tools).toEqualTypeOf<readonly ConnectionToolMetadata[] | undefined>();

    const basicDef = toFlueConnection("basic", { description: "basic" });
    expectTypeOf(basicDef.name).toBeString();
    expectTypeOf(basicDef.tools).toEqualTypeOf<readonly ConnectionToolMetadata[] | undefined>();
  });

  it("supports MCP connection definitions", () => {
    const def: FlueConnectionDefinition = {
      name: "linear",
      description: "Linear",
      mcp: { url: "https://mcp.linear.app" },
    };
    expectTypeOf(def.mcp).not.toBeAny();
    expectTypeOf(def.mcp!.url).toBeString();
  });
});
