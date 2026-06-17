import { flueEve } from "@flue-eve/vite";
import type { FlueEvePluginOptions } from "@flue-eve/vite";
import type { Plugin, UserConfig } from "vite";

export type { FlueEvePluginOptions as EveSvelteKitOptions };

export function eveSvelteKit(options?: FlueEvePluginOptions): Plugin[] {
  const fluePort = options?.fluePort ?? 3583;
  const eveMount = options?.eveMount ?? "/eve/v1";

  const proxyPlugin: Plugin = {
    name: "flue-eve:sveltekit-proxy",
    config(config: UserConfig) {
      const proxyTarget = `http://127.0.0.1:${fluePort}`;
      const proxyRule = {
        target: proxyTarget,
        changeOrigin: true,
      };

      const existingProxy =
        typeof config.server?.proxy === "object" && !Array.isArray(config.server.proxy)
          ? { ...config.server.proxy }
          : {};

      return {
        server: {
          ...config.server,
          proxy: {
            ...existingProxy,
            [eveMount]: proxyRule,
          },
        },
      };
    },
  };

  return [proxyPlugin, flueEve(options)];
}
