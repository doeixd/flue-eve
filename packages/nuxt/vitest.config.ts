import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@flue-eve/shared": resolve(import.meta.dirname!, "../shared/dist/index.js"),
      "@flue-eve/connections/search": resolve(import.meta.dirname!, "../connections/dist/connection-search.js"),
      "@flue-eve/connections/connect": resolve(import.meta.dirname!, "../connections/dist/connect.js"),
      "@flue-eve/connections": resolve(import.meta.dirname!, "../connections/dist/index.js"),
      "@flue-eve/workflows": resolve(import.meta.dirname!, "../workflows/dist/index.js"),
      "@flue-eve/channels": resolve(import.meta.dirname!, "../channels/dist/index.js"),
      "@flue-eve/vite/config": resolve(import.meta.dirname!, "../vite/dist/config.js"),
      "@flue-eve/vite": resolve(import.meta.dirname!, "../vite/dist/index.js"),
      "@flue-eve/sveltekit": resolve(import.meta.dirname!, "../sveltekit/dist/index.js"),
      "@flue-eve/nuxt": resolve(import.meta.dirname!, "../nuxt/dist/index.js"),
      "@flue-eve/compat-server/worker": resolve(import.meta.dirname!, "../compat-server/dist/eve-worker.js"),
      "@flue-eve/compat-server": resolve(import.meta.dirname!, "../compat-server/dist/index.js"),
      "@flue-eve/client": resolve(import.meta.dirname!, "../client/dist/index.js"),
      "@flue-eve/nitro": resolve(import.meta.dirname!, "../nitro/dist/index.js"),
      "@flue-eve/react": resolve(import.meta.dirname!, "../react/dist/index.js"),
    },
  },
  test: {
    name: "nuxt",
    include: ["src/**/*.test.ts"],
    environment: "node",
    server: { deps: { inline: [/@flue-eve/, "flue-eve"] } },
  },
});
