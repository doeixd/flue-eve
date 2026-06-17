import { flueEve } from "@flue-eve/vite";
import type { FlueEvePluginOptions } from "@flue-eve/vite";
import type { Plugin } from "vite";

export type { FlueEvePluginOptions as EveNitroOptions };

export function eveNitro(options?: FlueEvePluginOptions): {
  vite?: { plugins: Plugin[] };
  plugins?: string[];
} {
  const plugins: Plugin[] = [flueEve(options)];

  return {
    vite: { plugins },
    plugins: ["@flue-eve/nitro/runtime-plugin"],
  };
}
