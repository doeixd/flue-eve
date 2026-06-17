import { defineConfig } from "vite-plus";

/** Root toolchain config for `vp test`, `vp check`, and monorepo task caching. */
export default defineConfig({
  test: {
    projects: ["packages/*/vitest.config.ts"],
  },
});