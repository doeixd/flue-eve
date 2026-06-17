import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "compat-server",
    include: ["src/**/*.test.ts"],
    environment: "node",
    testTimeout: 10000,
  },
});