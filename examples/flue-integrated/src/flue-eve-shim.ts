// @flue-eve/generated — Eve compat sidecar for Flue app.ts
import {
  eveCompat,
  resolveAdmissionFromRuntime,
  resolveEveCompatDefaults,
} from "flue-eve/server";
import type { Hono } from "hono";

import { connectionRegistry } from "./connections/index.js";

export const flueEveConfig = {
  eveMount: "/eve/v1",
  agentName: "assistant",
} as const;

function resolveEveAdmission() {
  return resolveAdmissionFromRuntime(flueEveConfig.agentName, {
    flueBaseUrl: process.env.FLUE_BASE_URL,
  });
}

export function mountEveCompat(app: Hono): void {
  app.route(
    flueEveConfig.eveMount,
    eveCompat({
      agentName: flueEveConfig.agentName,
      connections: connectionRegistry,
      ...resolveEveCompatDefaults(),
      admission: resolveEveAdmission(),
    }),
  );
}
