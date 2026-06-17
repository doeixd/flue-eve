import { describe, expect, it, vi } from "vitest";

vi.mock("@nuxt/kit", () => ({
  defineNuxtModule: vi.fn((def: any) => def),
  addVitePlugin: vi.fn(),
}));

describe("@flue-eve/nuxt", () => {
  it("exports defineNuxtModule-compatible config", async () => {
    const mod = await import("./index.js");
    const def = mod.default as any;
    expect(def).toBeDefined();
    expect(def.meta).toBeDefined();
    expect(def.meta.name).toBe("flue-eve");
    expect(def.meta.configKey).toBe("flueEve");
    expect(def.meta.compatibility.nuxt).toBe("^3.0.0");
  });

  it("has sensible defaults", async () => {
    const mod = await import("./index.js");
    const defaults = (mod.default as any).defaults;
    expect(defaults.agentName).toBe("assistant");
    expect(defaults.fluePort).toBe(3583);
    expect(defaults.eveMount).toBe("/eve/v1");
    expect(defaults.spawnFlueDev).toBe(true);
  });

  it("setup calls addVitePlugin with flueEve plugin", async () => {
    const { addVitePlugin } = await import("@nuxt/kit");
    const mod = await import("./index.js");

    (mod.default as any).setup({ agentName: "nuxt-agent" }, {});

    expect(addVitePlugin).toHaveBeenCalledOnce();
    const plugin = (addVitePlugin as any).mock.calls[0][0];
    expect(plugin).toBeDefined();
    expect(plugin.name).toBe("flue-eve");
    vi.clearAllMocks();
  });
});
