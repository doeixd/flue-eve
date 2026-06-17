import { describe, expect, it } from "vitest";

import { eveToolNameToFlue, flueToolNameToEve } from "./tools.js";

describe("tool name normalization", () => {
  it("maps mcp__ to connection__", () => {
    expect(flueToolNameToEve("mcp__linear__list_issues")).toBe(
      "connection__linear__list_issues",
    );
  });

  it("maps connection__ to mcp__", () => {
    expect(eveToolNameToFlue("connection__inventory__lookup_item")).toBe(
      "mcp__inventory__lookup_item",
    );
  });

  it("leaves custom tool names unchanged", () => {
    expect(flueToolNameToEve("lookup_order")).toBe("lookup_order");
  });

  it("leaves malformed mcp names unchanged", () => {
    expect(flueToolNameToEve("mcp__onlyonepart")).toBe("mcp__onlyonepart");
    expect(flueToolNameToEve("mcp____")).toBe("mcp____");
  });

  it("round-trips connection and mcp names", () => {
    const eveName = flueToolNameToEve("mcp__github__search_code");
    expect(eveToolNameToFlue(eveName)).toBe("mcp__github__search_code");
  });
});