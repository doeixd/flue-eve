import { describe, expect, it } from "vitest";
import { eveSvelteKit } from "./index.js";

describe("eveSvelteKit", () => {
  it("returns an array of plugins", () => {
    const plugins = eveSvelteKit();
    expect(Array.isArray(plugins)).toBe(true);
    expect(plugins.length).toBeGreaterThanOrEqual(1);
    expect(plugins[0]).toBeDefined();
  });

  it("first plugin is the proxy config plugin", () => {
    const plugins = eveSvelteKit({ fluePort: 3583, eveMount: "/eve/v1" });
    const proxyPlugin = plugins[0]!;
    expect(proxyPlugin.name).toBe("flue-eve:sveltekit-proxy");
    expect(typeof proxyPlugin.config).toBe("function");
  });

  it("config hook adds proxy entry", () => {
    const plugins = eveSvelteKit();
    const proxyPlugin = plugins[0]!;
    const result = (proxyPlugin.config as Function)({}, { command: "serve", mode: "development" });
    expect(result).toBeDefined();
    expect(result!.server!.proxy!["/eve/v1"]).toBeDefined();
    expect(result!.server!.proxy!["/eve/v1"].target).toContain("127.0.0.1:3583");
    expect(result!.server!.proxy!["/eve/v1"].changeOrigin).toBe(true);
  });

  it("config hook respects custom eveMount and fluePort", () => {
    const plugins = eveSvelteKit({ fluePort: 3584, eveMount: "/custom/v1" });
    const proxyPlugin = plugins[0]!;
    const result = (proxyPlugin.config as Function)({}, { command: "serve", mode: "development" });
    expect(result!.server!.proxy!["/custom/v1"]).toBeDefined();
    expect(result!.server!.proxy!["/custom/v1"].target).toContain("127.0.0.1:3584");
  });

  it("merges with existing proxy config", () => {
    const plugins = eveSvelteKit();
    const proxyPlugin = plugins[0]!;
    const result = (proxyPlugin.config as Function)(
      { server: { proxy: { "/api": { target: "http://api.example.com" } } } as any },
      { command: "serve", mode: "development" },
    );
    expect(result!.server!.proxy!["/api"]).toBeDefined();
    expect(result!.server!.proxy!["/api"].target).toBe("http://api.example.com");
    expect(result!.server!.proxy!["/eve/v1"]).toBeDefined();
  });
});
