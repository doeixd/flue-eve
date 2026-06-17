import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { createAuthMiddleware, resolveAuthPolicy } from "./auth.js";

describe("resolveAuthPolicy", () => {
  it("defaults to local-dev outside production", () => {
    expect(resolveAuthPolicy(undefined, "development")).toEqual({ mode: "local-dev" });
  });

  it("fails closed in production without explicit auth", () => {
    expect(resolveAuthPolicy(undefined, "production")).toEqual({
      mode: "bearer",
      bearerToken: undefined,
    });
  });

  it("honors bearer tokens", () => {
    expect(resolveAuthPolicy({ bearer: "secret" }, "production")).toEqual({
      mode: "bearer",
      bearerToken: "secret",
    });
  });
});

describe("createAuthMiddleware", () => {
  it("rejects missing bearer tokens in production mode", async () => {
    const app = new Hono();
    app.use("*", createAuthMiddleware({ mode: "bearer", bearerToken: "secret" }));
    app.post("/session", (c) => c.json({ ok: true }));

    const response = await app.request("/session", { method: "POST" });
    expect(response.status).toBe(401);
  });

  it("accepts valid bearer tokens", async () => {
    const app = new Hono();
    app.use("*", createAuthMiddleware({ mode: "bearer", bearerToken: "secret" }));
    app.post("/session", (c) => c.json({ ok: true }));

    const response = await app.request("/session", {
      method: "POST",
      headers: { authorization: "Bearer secret" },
    });
    expect(response.status).toBe(200);
  });

  it("rejects wrong bearer tokens", async () => {
    const app = new Hono();
    app.use("*", createAuthMiddleware({ mode: "bearer", bearerToken: "secret" }));
    app.post("/session", (c) => c.json({ ok: true }));

    const response = await app.request("/session", {
      method: "POST",
      headers: { authorization: "Bearer wrong" },
    });
    expect(response.status).toBe(401);
  });

  it("rejects malformed authorization headers", async () => {
    const app = new Hono();
    app.use("*", createAuthMiddleware({ mode: "bearer", bearerToken: "secret" }));
    app.post("/session", (c) => c.json({ ok: true }));

    const response = await app.request("/session", {
      method: "POST",
      headers: { authorization: "Token secret" },
    });
    expect(response.status).toBe(401);
  });

  it("allows all requests in local-dev mode", async () => {
    const app = new Hono();
    app.use("*", createAuthMiddleware({ mode: "local-dev" }));
    app.post("/session", (c) => c.json({ ok: true }));

    const response = await app.request("/session", { method: "POST" });
    expect(response.status).toBe(200);
  });

  it("allows all requests in none mode", async () => {
    const app = new Hono();
    app.use("*", createAuthMiddleware({ mode: "none" }));
    app.post("/session", (c) => c.json({ ok: true }));

    const response = await app.request("/session", { method: "POST" });
    expect(response.status).toBe(200);
  });
});

describe("resolveAuthPolicy edge cases", () => {
  it("honors auth: none and local-dev explicitly", () => {
    expect(resolveAuthPolicy("none", "production")).toEqual({ mode: "none" });
    expect(resolveAuthPolicy("local-dev", "production")).toEqual({ mode: "local-dev" });
  });

  it("rejects empty bearer strings in production", () => {
    expect(resolveAuthPolicy({ bearer: "" }, "production")).toEqual({
      mode: "bearer",
      bearerToken: undefined,
    });
  });
});