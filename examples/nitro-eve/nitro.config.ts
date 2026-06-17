import { defineNitroConfig } from "nitropack/config";
import { eveNitro } from "@flue-eve/nitro";

export default defineNitroConfig({
  ...eveNitro({
    agentName: "assistant",
    fluePort: 3583,
    eveMount: "/eve/v1",
    spawnFlueDev: true,
  }),
});
