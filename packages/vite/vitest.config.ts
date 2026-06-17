import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const fromHere = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: "flue-eve/vite/config", replacement: fromHere("../flue-eve/src/vite-config.ts") },
      { find: "flue-eve/client", replacement: fromHere("../flue-eve/src/client.ts") },
      { find: "flue-eve/connections/search", replacement: fromHere("../flue-eve/src/connections-search.ts") },
      { find: "flue-eve/connections", replacement: fromHere("../flue-eve/src/connections.ts") },
      { find: "flue-eve/server", replacement: fromHere("../flue-eve/src/server.ts") },
      { find: "flue-eve/vite", replacement: fromHere("../flue-eve/src/vite.ts") },
      { find: "@flue-eve/client", replacement: fromHere("../client/src/index.ts") },
      { find: "@flue-eve/compat-server", replacement: fromHere("../compat-server/src/index.ts") },
      { find: "@flue-eve/connections/search", replacement: fromHere("../connections/src/connection-search.ts") },
      { find: "@flue-eve/connections", replacement: fromHere("../connections/src/index.ts") },
      { find: "@flue-eve/shared", replacement: fromHere("../shared/src/index.ts") },
      { find: "@flue/runtime/internal", replacement: fromHere("../compat-server/node_modules/@flue/runtime/dist/internal.mjs") },
      { find: "@flue/runtime", replacement: fromHere("../compat-server/node_modules/@flue/runtime/dist/index.mjs") },
      { find: "hono/cors", replacement: fromHere("../compat-server/node_modules/hono/dist/middleware/cors/index.js") },
      { find: "hono", replacement: fromHere("../compat-server/node_modules/hono/dist/index.js") },
    ],
  },
  test: {
    name: "vite",
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
