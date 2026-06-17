import { createEveWorkerApp, resolveWorkerAdmission, type EveWorkerBindings } from "flue-eve/server/worker";

export { EveSessionJournalDO } from "./session-journal-do.js";

export interface Env extends EveWorkerBindings {
  readonly SESSIONS_KV?: KVNamespace;
  readonly EVE_JOURNAL_DO?: DurableObjectNamespace;
  /** Service Binding to a Flue agent Worker (optional — in-process admission also probed). */
  readonly FLUE_AGENT?: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const admission = await resolveWorkerAdmission(
      env.EVE_AGENT_NAME ?? "assistant",
      env,
    );
    const app = createEveWorkerApp(
      { ...env, EVE_JOURNAL_DO: env.EVE_JOURNAL_DO },
      { admission },
    );
    return app.fetch(request);
  },
};
