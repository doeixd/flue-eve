import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "client",
    include: ["src/**/*.test.ts"],
    environment: "node",
    testTimeout: 15000,
  },
});