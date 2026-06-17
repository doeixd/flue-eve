import { afterEach, describe, expect, it } from "vitest";

import { createMockAdmission } from "./admission/mock.js";
import { eveCompat } from "./eve-compat.js";
import { createMemoryJournalPersistence } from "./journal-persistence.js";
import { resolveEveCompatDefaults } from "./resolve-compat-defaults.js";
import { resolveEveProductionOptions } from "./resolve-production.js";

const originalNodeEnv = process.env.NODE_ENV;
const originalBearer = process.env.EVE_AUTH_BEARER;
const originalPersistence = process.env.EVE_JOURNAL_PERSISTENCE;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  if (originalBearer === undefined) delete process.env.EVE_AUTH_BEARER;
  else process.env.EVE_AUTH_BEARER = originalBearer;
  if (originalPersistence === undefined) delete process.env.EVE_JOURNAL_PERSISTENCE;
  else process.env.EVE_JOURNAL_PERSISTENCE = originalPersistence;
});

describe("M6 exit criteria", () => {
  it("fails closed in production when EVE_AUTH_BEARER is unset", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.EVE_AUTH_BEARER;

    const app = eveCompat({
      agentName: "assistant",
      ...resolveEveCompatDefaults(),
    });

    expect((await app.request("/health")).status).toBe(200);
    expect(
      (
        await app.request("/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: "Hello" }),
        })
      ).status,
    ).toBe(401);
  });

  it("accepts bearer-authenticated turns via resolveEveProductionOptions", async () => {
    process.env.NODE_ENV = "production";
    process.env.EVE_AUTH_BEARER = "deploy-secret";

    const app = eveCompat({
      agentName: "assistant",
      admission: createMockAdmission(),
      ...resolveEveCompatDefaults(),
    });

    const start = await app.request("/session", {
      method: "POST",
      headers: {
        authorization: "Bearer deploy-secret",
        "content-type": "application/json",
      },
      body: JSON.stringify({ message: "Hello" }),
    });
    expect(start.status).toBe(202);
  });

  it("reloads persisted sessions across cold instances with bearer auth", async () => {
    process.env.NODE_ENV = "production";
    process.env.EVE_AUTH_BEARER = "deploy-secret";
    const persistence = createMemoryJournalPersistence();
    const admission = createMockAdmission();
    const auth = resolveEveProductionOptions("production").auth;

    const warm = eveCompat({ agentName: "assistant", admission, persistence, auth });
    const start = await warm.request("/session", {
      method: "POST",
      headers: {
        authorization: "Bearer deploy-secret",
        "content-type": "application/json",
      },
      body: JSON.stringify({ message: "Hello" }),
    });
    const { sessionId, continuationToken } = (await start.json()) as {
      sessionId: string;
      continuationToken: string;
    };

    await new Promise((resolve) => setTimeout(resolve, 120));

    const cold = eveCompat({ agentName: "assistant", admission, persistence, auth });
    const follow = await cold.request(`/session/${sessionId}`, {
      method: "POST",
      headers: {
        authorization: "Bearer deploy-secret",
        "content-type": "application/json",
      },
      body: JSON.stringify({ message: "Again", continuationToken }),
    });
    expect(follow.status).toBe(200);
  });

  it("does not expose /debug/journal in production", async () => {
    process.env.NODE_ENV = "production";
    const app = eveCompat({ agentName: "assistant", auth: "local-dev" });

    const response = await app.request("/debug/journal/ses_missing");
    expect(response.status).toBe(404);
  });

  it("exposes /debug/journal in non-production for operator inspection", async () => {
    process.env.NODE_ENV = "development";
    const app = eveCompat({ agentName: "assistant", admission: createMockAdmission() });

    const start = await app.request("/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Hello" }),
    });
    const { sessionId } = (await start.json()) as { sessionId: string };
    await new Promise((resolve) => setTimeout(resolve, 120));

    const debug = await app.request(`/debug/journal/${sessionId}`);
    expect(debug.status).toBe(200);
    const body = (await debug.json()) as { ok: boolean; events: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.events.length).toBeGreaterThan(0);
  });
});