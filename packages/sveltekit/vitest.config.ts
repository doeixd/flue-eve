import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "sveltekit",
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
