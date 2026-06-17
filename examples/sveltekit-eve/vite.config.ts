import { sveltekit } from "@sveltejs/kit/vite";
import { eveSvelteKit } from "@flue-eve/sveltekit";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit(), ...eveSvelteKit()],
});
