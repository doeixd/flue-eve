import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const packageDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@flue-eve/client": resolve(packageDir, "../client/src/index.ts"),
      "@flue-eve/shared": resolve(packageDir, "../shared/src/index.ts"),
    },
  },
  test: {
    name: "react",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
    testTimeout: 15000,
  },
});