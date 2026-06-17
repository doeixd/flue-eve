import { describe, expect, it } from "vitest";

import { defineFlueConnection } from "./define-connection.js";
import { createConnectionRegistry } from "./registry.js";
import { searchConnections } from "./search.js";

describe("searchConnections", () => {
  it("matches tools by keyword and returns qualified names", () => {
    const registry = createConnectionRegistry();
    defineFlueConnection(
      {
        name: "linear",
        description: "Linear workspace",
        tools: [
          {
            name: "list_issues",
            description: "List issues in a workspace",
            qualifiedName: "connection__linear__list_issues",
          },
          {
            name: "create_issue",
            description: "Create a new issue",
            qualifiedName: "connection__linear__create_issue",
          },
        ],
      },
      registry,
    );

    const results = searchConnections(registry, { keywords: "list issues", limit: 1 });
    expect(results).toEqual([
      expect.objectContaining({
        connection: "linear",
        tool: "list_issues",
        qualifiedName: "connection__linear__list_issues",
      }),
    ]);
  });

  it("limits search to one connection when requested", () => {
    const registry = createConnectionRegistry();
    defineFlueConnection(
      {
        name: "linear",
        description: "Linear",
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
    defineFlueConnection(
      {
        name: "inventory",
        description: "Inventory",
        tools: [
          {
            name: "lookup_item",
            description: "Lookup inventory item",
            qualifiedName: "connection__inventory__lookup_item",
          },
        ],
      },
      registry,
    );

    const results = searchConnections(registry, {
      keywords: "lookup",
      connection: "inventory",
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.connection).toBe("inventory");
  });

  it("returns connection summaries when keywords are empty", () => {
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

    const results = searchConnections(registry, { keywords: "" });
    expect(results).toEqual([
      { connection: "linear", description: "Linear workspace" },
    ]);
  });

  it("returns no matches for unrelated keywords", () => {
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

    const results = searchConnections(registry, { keywords: "zzzznonexistent" });
    expect(results).toEqual([]);
  });

  it("respects the limit parameter", () => {
    const registry = createConnectionRegistry();
    defineFlueConnection(
      {
        name: "linear",
        description: "Linear",
        tools: Array.from({ length: 5 }, (_, index) => ({
          name: `tool_${index}`,
          description: `List item ${index}`,
          qualifiedName: `connection__linear__tool_${index}`,
        })),
      },
      registry,
    );

    const results = searchConnections(registry, { keywords: "list item", limit: 2 });
    expect(results).toHaveLength(2);
  });
});