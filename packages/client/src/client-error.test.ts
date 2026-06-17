// Adapted from vercel/eve packages/eve/src/client/client-error.test.ts (Apache-2.0)
import { describe, expect, it } from "vitest";

import { ClientError } from "./client-error.js";

describe("ClientError", () => {
  it("parses JSON error field", () => {
    const error = new ClientError(400, JSON.stringify({ error: "Bad request" }));
    expect(error.message).toBe("Bad request");
    expect(error.status).toBe(400);
  });

  it("falls back to body text", () => {
    const error = new ClientError(500, "internal");
    expect(error.message).toBe("internal");
  });
});