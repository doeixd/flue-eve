import { describe, expect, it } from "vitest";

import { createContinuationToken, createSessionId, createTurnId } from "./tokens.js";

describe("token factories", () => {
  it("creates unique session ids with the ses_ prefix", () => {
    const a = createSessionId();
    const b = createSessionId();

    expect(a).toMatch(/^ses_[A-Za-z0-9_-]+$/);
    expect(b).toMatch(/^ses_[A-Za-z0-9_-]+$/);
    expect(a).not.toBe(b);
  });

  it("creates unique continuation tokens with the eve: prefix", () => {
    const a = createContinuationToken();
    const b = createContinuationToken();

    expect(a).toMatch(/^eve:[A-Za-z0-9_-]+$/);
    expect(a).not.toBe(b);
  });

  it("creates unique turn ids with the turn_ prefix", () => {
    const turnId = createTurnId();
    expect(turnId).toMatch(/^turn_[A-Za-z0-9_-]+$/);
  });
});