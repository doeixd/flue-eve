import type { NitroAppPlugin } from "nitropack/types";
import { fromWebHandler } from "h3";
import { createEveWebHandler, resolveAdmission } from "@flue-eve/compat-server";

const plugin: NitroAppPlugin = (nitroApp) => {
  const agentName = process.env.FLUE_AGENT_NAME ?? "assistant";
  const eveMount = process.env.FLUE_EVE_MOUNT ?? "/eve/v1";

  const handler = createEveWebHandler({
    agentName,
    admission: resolveAdmission({ agentName }),
  }, { mount: "/" });

  nitroApp.h3App.use(
    eveMount,
    fromWebHandler(handler),
  );
};

export default plugin;
