// Adapted from vercel/eve packages/eve/src/client/url.test.ts (Apache-2.0)
import { describe, expect, it } from "vitest";

import { createClientUrl } from "./url.js";

describe("createClientUrl", () => {
  it("joins same-origin host and route", () => {
    expect(createClientUrl("/api", "/eve/v1/health")).toBe("/api/eve/v1/health");
  });

  it("joins absolute host and route", () => {
    expect(createClientUrl("https://agent.example.com", "/eve/v1/session")).toBe(
      "https://agent.example.com/eve/v1/session",
    );
  });

  it("appends search params", () => {
    expect(
      createClientUrl("https://agent.example.com", "/eve/v1/session/s1/stream", {
        startIndex: "4",
      }),
    ).toBe("https://agent.example.com/eve/v1/session/s1/stream?startIndex=4");
  });
});