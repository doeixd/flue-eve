import type { NitroAppPlugin } from "nitropack/types";
import { fromWebHandler } from "h3";
import { createEveCompatApp, resolveAdmission } from "@flue-eve/compat-server";

const plugin: NitroAppPlugin = (nitroApp) => {
  const agentName = process.env.FLUE_AGENT_NAME ?? "assistant";
  const eveMount = process.env.FLUE_EVE_MOUNT ?? "/eve/v1";

  const app = createEveCompatApp({
    agentName,
    admission: resolveAdmission({ agentName }),
  });

  nitroApp.h3App.use(
    eveMount,
    fromWebHandler(async (request) => app.fetch(request)),
  );
};

export default plugin;
