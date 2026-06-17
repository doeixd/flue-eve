import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

describe("flue-eve package boundaries", () => {
  it("publishes the flue-eve CLI bin", () => {
    const manifest = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf8")) as {
      bin?: Record<string, string>;
    };
    expect(manifest.bin?.["flue-eve"]).toBe("./dist/cli.js");
  });

  it("M8-3: client imports without React, Vite, Hono, or Flue runtime", async () => {
    const mod = await import("flue-eve/client");
    expect(mod.Client).toBeTypeOf("function");
  });

  it("M8-3: root export does not eagerly import every subpath", () => {
    const content = readFileSync(resolve(__dirname, "index.ts"), "utf8");
    expect(content).not.toContain("React");
    expect(content).not.toContain("Vite");
  });

  it("M8-3: vite subpath is importable", async () => {
    const mod = await import("flue-eve/vite");
    expect(mod.flueEve).toBeTypeOf("function");
  });

  it("M8-3: vite/config subpath exports defineEveCompat", async () => {
    const mod = await import("flue-eve/vite/config");
    expect(mod.defineEveCompat).toBeTypeOf("function");
  });

  it("M8-3: server subpath imports without React or Vite", async () => {
    const mod = await import("flue-eve/server");
    expect(mod.eveCompat).toBeTypeOf("function");
    expect(mod.createInProcessAdmission).toBeTypeOf("function");
    expect(mod.resolveAdmissionFromRuntime).toBeTypeOf("function");
  });

  it("M8-3: connections subpath is importable", async () => {
    const mod = await import("flue-eve/connections");
    expect(mod.createConnectionRegistry).toBeTypeOf("function");
  });

  it("M8-3: connections/search subpath exports", async () => {
    const mod = await import("flue-eve/connections/search");
    expect(mod.createConnectionSearchTool).toBeTypeOf("function");
  });
});
