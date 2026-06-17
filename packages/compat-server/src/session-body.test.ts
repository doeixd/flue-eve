import { describe, expect, it } from "vitest";

import { parseSessionPostBody } from "./session-body.js";

describe("parseSessionPostBody", () => {
  it("accepts message-only bodies", () => {
    const result = parseSessionPostBody({ message: "Hello" });
    expect(result).toEqual({ ok: true, body: { message: "Hello" } });
  });

  it("accepts inputResponses-only bodies", () => {
    const result = parseSessionPostBody({
      inputResponses: [{ requestId: "approval_1", optionId: "deny" }],
    });
    expect(result).toEqual({
      ok: true,
      body: { inputResponses: [{ requestId: "approval_1", optionId: "deny" }] },
    });
  });

  it("accepts message and inputResponses together", () => {
    const result = parseSessionPostBody({
      message: "Resume",
      inputResponses: [{ requestId: "approval_1", optionId: "approve" }],
      continuationToken: "eve:token",
    });
    expect(result).toEqual({
      ok: true,
      body: {
        message: "Resume",
        continuationToken: "eve:token",
        inputResponses: [{ requestId: "approval_1", optionId: "approve" }],
      },
    });
  });

  it("rejects empty bodies", () => {
    const result = parseSessionPostBody({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toMatch(/message|inputResponses/);
    }
  });

  it("rejects malformed inputResponses entries", () => {
    const result = parseSessionPostBody({ inputResponses: [{ requestId: "" }] });
    expect(result.ok).toBe(false);
  });

  it("accepts outputSchema on session bodies", () => {
    const result = parseSessionPostBody({
      message: "Summarize",
      outputSchema: { type: "object", properties: { title: { type: "string" } } },
    });
    expect(result).toEqual({
      ok: true,
      body: {
        message: "Summarize",
        outputSchema: { type: "object", properties: { title: { type: "string" } } },
      },
    });
  });

  it("accepts clientContext and combinatorial fields together", () => {
    const result = parseSessionPostBody({
      message: "Go",
      continuationToken: "eve:abc",
      inputResponses: [{ requestId: "req_1", text: "yes" }],
      outputSchema: { type: "object" },
      clientContext: { locale: "en-US", tabId: "main" },
    });
    expect(result).toEqual({
      ok: true,
      body: {
        message: "Go",
        continuationToken: "eve:abc",
        inputResponses: [{ requestId: "req_1", text: "yes" }],
        outputSchema: { type: "object" },
        clientContext: { locale: "en-US", tabId: "main" },
      },
    });
  });

  it("rejects non-object bodies", () => {
    expect(parseSessionPostBody(null).ok).toBe(false);
    expect(parseSessionPostBody("hello").ok).toBe(false);
    expect(parseSessionPostBody([]).ok).toBe(false);
  });

  it("accepts string and string-array clientContext (Eve parity)", () => {
    expect(parseSessionPostBody({ message: "hi", clientContext: "route: /editor" })).toEqual({
      ok: true,
      body: { message: "hi", clientContext: "route: /editor" },
    });
    expect(
      parseSessionPostBody({
        message: "hi",
        clientContext: ["route: /editor", "selection: jazz"],
      }),
    ).toEqual({
      ok: true,
      body: { message: "hi", clientContext: ["route: /editor", "selection: jazz"] },
    });
  });

  it("rejects invalid field types", () => {
    expect(parseSessionPostBody({ message: 42 }).ok).toBe(false);
    expect(parseSessionPostBody({ outputSchema: "schema" }).ok).toBe(false);
    expect(parseSessionPostBody({ clientContext: [] }).ok).toBe(false);
    expect(parseSessionPostBody({ clientContext: [42] }).ok).toBe(false);
    expect(parseSessionPostBody({ clientContext: "" }).ok).toBe(false);
    const numeric = parseSessionPostBody({ message: "hi", clientContext: 123 });
    expect(numeric.ok).toBe(false);
    if (!numeric.ok) {
      expect(numeric.error).toContain("clientContext");
    }
    expect(parseSessionPostBody({ inputResponses: "nope" }).ok).toBe(false);
  });

  it("rejects whitespace-only messages", () => {
    const result = parseSessionPostBody({ message: "   " });
    expect(result.ok).toBe(false);
  });

  it("accepts text-only inputResponses entries", () => {
    const result = parseSessionPostBody({
      inputResponses: [{ requestId: "freeform_1", text: "User typed answer" }],
    });
    expect(result).toEqual({
      ok: true,
      body: { inputResponses: [{ requestId: "freeform_1", text: "User typed answer" }] },
    });
  });
});