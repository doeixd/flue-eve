// Adapted from vercel/eve packages/eve/test/eve-run-stream-channel.test.ts (Apache-2.0)
import { describe, expect, it } from "vitest";

import { parseStartIndex } from "./stream-query.js";

describe("parseStartIndex", () => {
  it("returns undefined when absent", () => {
    expect(parseStartIndex(new URLSearchParams())).toBeUndefined();
  });

  it("parses valid integers", () => {
    expect(parseStartIndex(new URLSearchParams("startIndex=42"))).toBe(42);
    expect(parseStartIndex(new URLSearchParams("startIndex=0"))).toBe(0);
  });

  it("rejects negative values", () => {
    const result = parseStartIndex(new URLSearchParams("startIndex=-3"));
    expect(result).toMatchObject({ error: expect.any(String) });
  });

  it("rejects non-integer values", () => {
    const result = parseStartIndex(new URLSearchParams("startIndex=banana"));
    expect(result).toMatchObject({ error: expect.any(String) });
  });
});