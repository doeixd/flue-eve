import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "nitro",
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
