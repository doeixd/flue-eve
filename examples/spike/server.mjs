import { serve } from "@hono/node-server";
import { createEveCompatApp, resolveAdmission } from "flue-eve/server";

const port = Number(process.env.PORT ?? 3583);
const app = createEveCompatApp({
  agentName: "assistant",
  admission: resolveAdmission({ agentName: "assistant" }),
});

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`M0 spike: http://127.0.0.1:${info.port}/eve/v1/health`);
});