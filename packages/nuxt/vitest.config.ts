import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "nuxt",
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
