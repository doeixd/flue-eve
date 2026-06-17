import { flueEve } from "flue-eve/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    flueEve({
      spawnFlueDev: false,
      validateProject: false,
      fluePort: 3583,
      eveMount: "/eve/v1",
    }),
  ],
});