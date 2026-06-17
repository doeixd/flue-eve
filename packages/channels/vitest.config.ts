import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "channels",
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
