import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "workflows",
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
