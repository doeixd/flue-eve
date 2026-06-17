import { describe, expect, it } from "vitest";

import { flueEve } from "./index.js";

describe("flueEve", () => {
  it("returns a vite plugin with proxy and virtual config hooks", () => {
    const plugin = flueEve({ spawnFlueDev: false });

    expect(plugin.name).toBe("flue-eve");
    expect(plugin.configureServer).toBeTypeOf("function");
    expect(plugin.resolveId).toBeTypeOf("function");
    expect(plugin.load).toBeTypeOf("function");
    expect(plugin.buildStart).toBeTypeOf("function");
  });

  it("aliases eve imports when enabled", () => {
    const plugin = flueEve({ spawnFlueDev: false, aliasEveImports: true });
    const configHook = plugin.config;
    expect(configHook).toBeTypeOf("function");
    if (typeof configHook !== "function") return;

    const resolved = configHook.call(
      undefined,
      {},
      { command: "serve", mode: "development" },
    ) as { resolve?: { alias?: Record<string, string> } };

    expect(resolved.resolve?.alias).toEqual({
      "eve/client": "flue-eve/client",
      "eve/react": "flue-eve/react",
    });
  });
});
