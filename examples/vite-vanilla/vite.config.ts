import { flueEve } from "flue-eve/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    flueEve({
      spawnFlueDev: false,
      validateProject: false,
      fluePort: 3583,
      eveMount: "/eve/v1",
    }),
  ],
});