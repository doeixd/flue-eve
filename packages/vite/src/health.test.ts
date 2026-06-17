import { describe, expect, it, vi } from "vitest";

import { waitForUpstream } from "./health.js";

describe("waitForUpstream", () => {
  it("resolves when Eve health returns ready", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/eve/v1/health")) {
        return Response.json({ ok: true, status: "ready" });
      }
      return new Response("not found", { status: 404 });
    });

    await expect(
      waitForUpstream({
        baseUrl: "http://127.0.0.1:3583",
        eveMount: "/eve/v1",
        fetch: fetchMock as typeof fetch,
        timeoutMs: 1000,
        intervalMs: 10,
      }),
    ).resolves.toBeUndefined();
  });

  it("falls back to openapi.json", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/openapi.json")) {
        return new Response("{}", { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });

    await expect(
      waitForUpstream({
        baseUrl: "http://127.0.0.1:3583",
        fetch: fetchMock as typeof fetch,
        timeoutMs: 1000,
        intervalMs: 10,
      }),
    ).resolves.toBeUndefined();
  });
});