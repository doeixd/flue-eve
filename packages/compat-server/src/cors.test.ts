import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { createEveCorsMiddleware } from "./cors.js";

describe("createEveCorsMiddleware", () => {
  it("allows preflight from configured origin and exposes Eve stream headers", async () => {
    const app = new Hono();
    app.use("*", createEveCorsMiddleware({ origin: "https://www.example.com" }));
    app.get("/eve/v1/health", (c) => c.json({ ok: true }));

    const response = await app.request("https://api.example.com/eve/v1/health", {
      method: "OPTIONS",
      headers: {
        origin: "https://www.example.com",
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization,content-type",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://www.example.com");
    expect(response.headers.get("access-control-expose-headers")).toContain("x-eve-stream-version");
  });
});