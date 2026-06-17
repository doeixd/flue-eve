import { describe, expect, it } from "vitest";

import { createMockAdmission } from "./admission/mock.js";
import { createMemoryJournalPersistence } from "./journal-persistence.js";
import { SessionStore } from "./session-store.js";
import { runTurn } from "./turn-runner.js";

describe("SessionStore persistence", () => {
  it("reloads a settled session from persistence after process restart", async () => {
    const persistence = createMemoryJournalPersistence();
    const liveStore = new SessionStore({ persistence });
    const session = liveStore.create({
      sessionId: "ses_reload",
      agentName: "assistant",
      continuationToken: "eve:reload",
    });

    await runTurn({
      session,
      message: "Hello",
      admission: createMockAdmission(),
      store: liveStore,
    });

    await new Promise((resolve) => setTimeout(resolve, 80));

    const reloadedStore = new SessionStore({ persistence });
    const reloaded = await reloadedStore.resolve("ses_reload");

    expect(reloaded).toBeDefined();
    expect(reloaded?.status).toBe("waiting");
    expect(reloaded?.continuationToken).toBe("eve:reload");
    expect(reloaded?.journal.nextIndex).toBeGreaterThan(0);
    expect(
      reloaded?.journal.snapshot(0).events.some((event) => event.type === "session.waiting"),
    ).toBe(true);
  });

  it("persists OAuth park state with pendingAuthorization", async () => {
    const persistence = createMemoryJournalPersistence();
    const store = new SessionStore({ persistence });
    const session = store.create({
      sessionId: "ses_oauth",
      agentName: "assistant",
      continuationToken: "eve:oauth",
    });

    await runTurn({
      session,
      message: "Connect",
      admission: {
        async *admitTurn() {
          yield {
            type: "authorization_required",
            name: "linear",
            description: "Linear",
            authorization: { url: "https://idp.example.com/oauth" },
          };
          yield { type: "idle" };
        },
      },
      store,
    });

    const cold = new SessionStore({ persistence });
    const reloaded = await cold.resolve("ses_oauth");

    expect(reloaded?.status).toBe("active");
    expect(reloaded?.pendingAuthorization).toEqual({ connectionName: "linear" });
    expect(
      reloaded?.journal.snapshot(0).events.some((e) => e.type === "authorization.required"),
    ).toBe(true);
  });
});