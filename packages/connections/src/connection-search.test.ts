import { describe, expect, it } from "vitest";

import { createConnectionSearchTool } from "./connection-search.js";
import { defineFlueConnection } from "./define-connection.js";
import { createConnectionRegistry } from "./registry.js";

describe("createConnectionSearchTool", () => {
  it("exposes the Eve framework tool name and executes search", async () => {
    const registry = createConnectionRegistry();
    defineFlueConnection(
      {
        name: "linear",
        description: "Linear workspace",
        tools: [
          {
            name: "list_issues",
            description: "List issues",
            qualifiedName: "connection__linear__list_issues",
          },
        ],
      },
      registry,
    );

    const tool = createConnectionSearchTool(registry);
    expect(tool.name).toBe("connection__search");

    const results = await tool.execute({ keywords: "list issues" });
    expect(results[0]).toMatchObject({
      connection: "linear",
      qualifiedName: "connection__linear__list_issues",
    });
  });
});