import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "connections",
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});