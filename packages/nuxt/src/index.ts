import { defineNuxtModule, addVitePlugin } from "@nuxt/kit";
import { flueEve } from "@flue-eve/vite";
import type { FlueEvePluginOptions } from "@flue-eve/vite";

export type { FlueEvePluginOptions as FlueEveNuxtOptions };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const module: any = defineNuxtModule<FlueEvePluginOptions>({
  meta: {
    name: "flue-eve",
    configKey: "flueEve",
    compatibility: { nuxt: "^3.0.0" },
  },
  defaults: {
    agentName: "assistant",
    fluePort: 3583,
    eveMount: "/eve/v1",
    spawnFlueDev: true,
  },
  setup(options, _nuxt) {
    addVitePlugin(flueEve(options) as any);
  },
});

export default module;
