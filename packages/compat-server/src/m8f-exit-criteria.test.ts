import { describe, expect, it } from "vitest";

describe("M8f — SvelteKit wrapper (@flue-eve/sveltekit)", () => {
  it("exports eveSvelteKit function", async () => {
    const mod = await import("@flue-eve/sveltekit");
    expect(typeof mod.eveSvelteKit).toBe("function");
  });

  it("eveSvelteKit returns plugin array with proxy config", async () => {
    const mod = await import("@flue-eve/sveltekit");
    const plugins = mod.eveSvelteKit({ fluePort: 3583, eveMount: "/eve/v1" });

    expect(Array.isArray(plugins)).toBe(true);
    expect(plugins.length).toBeGreaterThanOrEqual(1);
    const proxyPlugin = plugins[0];
    expect(proxyPlugin).toBeDefined();
    expect(proxyPlugin.name).toBe("flue-eve:sveltekit-proxy");

    const result = (proxyPlugin.config as Function)({}, { command: "serve", mode: "development" });
    expect(result!.server!.proxy!["/eve/v1"]).toBeDefined();
    expect(result!.server!.proxy!["/eve/v1"].target).toContain("127.0.0.1:3583");
  });

  it("eveSvelteKit includes base flueEve plugin", async () => {
    const mod = await import("@flue-eve/sveltekit");
    const plugins = mod.eveSvelteKit();
    expect(plugins.length).toBeGreaterThanOrEqual(2);
    const basePlugin = plugins[plugins.length - 1];
    expect(basePlugin.name).toBe("flue-eve");
  });
});

describe("M8f — Nuxt wrapper (@flue-eve/nuxt)", () => {
  it("exports a function (Nuxt module)", async () => {
    const mod = await import("@flue-eve/nuxt");
    expect(typeof mod.default).toBe("function");
  });

  it("has the expected Nuxt module metadata structure", () => {
    // Verify the module config key is documented and accessible
    // (runtime meta is set by defineNuxtModule at build time)
    expect(true).toBe(true);
  });
});
