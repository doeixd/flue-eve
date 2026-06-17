import { afterEach, describe, expect, it } from "vitest";

import { eveCompat } from "./eve-compat.js";

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

describe("production auth", () => {
  it("rejects protected routes without bearer token when auth is unset", async () => {
    process.env.NODE_ENV = "production";
    const app = eveCompat({ agentName: "assistant", auth: { bearer: "prod-secret" } });

    const health = await app.request("/health");
    expect(health.status).toBe(200);

    const session = await app.request("/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Hello" }),
    });
    expect(session.status).toBe(401);

    const authorized = await app.request("/session", {
      method: "POST",
      headers: {
        authorization: "Bearer prod-secret",
        "content-type": "application/json",
      },
      body: JSON.stringify({ message: "Hello" }),
    });
    expect(authorized.status).toBe(202);
  });

  it("allows public routes with auth: none in production", async () => {
    process.env.NODE_ENV = "production";
    const app = eveCompat({ agentName: "assistant", auth: "none" });

    const session = await app.request("/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Hello" }),
    });
    expect(session.status).toBe(202);
  });

  it("rejects wrong bearer tokens on stream routes in production", async () => {
    process.env.NODE_ENV = "production";
    const app = eveCompat({ agentName: "assistant", auth: { bearer: "prod-secret" } });

    const start = await app.request("/session", {
      method: "POST",
      headers: {
        authorization: "Bearer prod-secret",
        "content-type": "application/json",
      },
      body: JSON.stringify({ message: "Hello" }),
    });
    const { sessionId } = (await start.json()) as { sessionId: string };

    const unauthorized = await app.request(`/session/${sessionId}/stream`, {
      headers: { authorization: "Bearer wrong" },
    });
    expect(unauthorized.status).toBe(401);
  });
});