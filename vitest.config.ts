import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/shared/vitest.config.ts",
      "packages/compat-server/vitest.config.ts",
      "packages/connections/vitest.config.ts",
      "packages/client/vitest.config.ts",
      "packages/vite/vitest.config.ts",
      "packages/react/vitest.config.ts",
    ],
  },
});