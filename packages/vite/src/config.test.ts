import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  defineEveCompat,
  findEveConfigPath,
  loadEveConfigFile,
  mergeFlueEveOptions,
} from "./config.js";

const tempDirs: string[] = [];

afterEach(() => {
  tempDirs.length = 0;
});

describe("defineEveCompat", () => {
  it("returns the config object unchanged", () => {
    const config = defineEveCompat({ agentName: "researcher", eveMount: "/custom/eve" });
    expect(config).toEqual({ agentName: "researcher", eveMount: "/custom/eve" });
  });
});

describe("mergeFlueEveOptions", () => {
  it("uses file defaults when plugin options are omitted", () => {
    expect(
      mergeFlueEveOptions(
        defineEveCompat({
          agentName: "researcher",
          eveMount: "/custom/eve",
          model: "anthropic/claude-sonnet-4-6",
          fluePort: 4000,
          forceScaffold: true,
          assistedMigration: true,
          strictMigration: true,
          scaffold: {
            agent: true,
            tools: true,
            connections: true,
          },
        }),
        {},
      ),
    ).toMatchObject({
      agentName: "researcher",
      eveMount: "/custom/eve",
      modelId: "anthropic/claude-sonnet-4-6",
      fluePort: 4000,
      forceScaffold: true,
      assistedMigration: true,
      strictMigration: true,
      scaffold: expect.objectContaining({
        agent: true,
        tools: true,
        connections: true,
      }),
    });
  });

  it("lets explicit plugin options override eve.config.ts", () => {
    expect(
      mergeFlueEveOptions(defineEveCompat({ agentName: "researcher", eveMount: "/file/eve" }), {
        agentName: "assistant",
        eveMount: "/plugin/eve",
        modelId: "openai/gpt-4.1",
      }),
    ).toEqual(
      expect.objectContaining({
        agentName: "assistant",
        eveMount: "/plugin/eve",
        modelId: "openai/gpt-4.1",
      }),
    );
  });

  it("normalizes eveMount trailing slashes from the file config", () => {
    expect(mergeFlueEveOptions(defineEveCompat({ eveMount: "/eve/v1/" }), {}).eveMount).toBe(
      "/eve/v1",
    );
  });
});

describe("loadEveConfigFile", () => {
  it("loads eve.config.mjs default export", async () => {
    const root = makeProjectRoot();
    writeFileSync(
      join(root, "eve.config.mjs"),
      `export default { agentName: "from-file", eveMount: "/from-file/eve" };\n`,
      "utf8",
    );

    await expect(loadEveConfigFile(root)).resolves.toEqual({
      agentName: "from-file",
      eveMount: "/from-file/eve",
    });
  });

  it("loads eve.config.ts via esbuild", async () => {
    const root = makeProjectRoot();
    writeFileSync(
      join(root, "eve.config.ts"),
      `export default { agentName: "ts-agent", fluePort: 3599 };\n`,
      "utf8",
    );

    await expect(loadEveConfigFile(root)).resolves.toMatchObject({
      agentName: "ts-agent",
      fluePort: 3599,
    });
  });

  it("returns undefined when no config file exists", async () => {
    const root = makeProjectRoot();
    await expect(loadEveConfigFile(root)).resolves.toBeUndefined();
    expect(findEveConfigPath(root)).toBeUndefined();
  });
});

function makeProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "flue-eve-config-"));
  tempDirs.push(root);
  mkdirSync(root, { recursive: true });
  return root;
}
