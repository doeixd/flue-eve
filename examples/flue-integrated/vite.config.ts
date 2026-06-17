import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { flueEve } from "flue-eve/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const projectRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: "src/ui",
  build: {
    outDir: resolve(projectRoot, "dist/client"),
    emptyOutDir: true,
  },
  plugins: [
    react(),
    flueEve({
      flueRoot: projectRoot,
    }),
  ],
});