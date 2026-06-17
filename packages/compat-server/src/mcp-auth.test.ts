import { describe, expect, it } from "vitest";

import { inferMcpAuthorizationRequired } from "./mcp-auth.js";

describe("inferMcpAuthorizationRequired", () => {
  it("returns authorization_required for MCP tool 401 errors", () => {
    const event = inferMcpAuthorizationRequired({
      toolName: "mcp__linear__list_issues",
      isError: true,
      output: { status: 401, message: "Unauthorized" },
    });

    expect(event).toEqual({
      type: "authorization_required",
      name: "linear",
      description: "linear connection",
      authorization: undefined,
    });
  });

  it("extracts OAuth challenge metadata when present", () => {
    const event = inferMcpAuthorizationRequired({
      toolName: "mcp__linear__list_issues",
      isError: true,
      output: {
        status: 401,
        authorization: {
          url: "https://idp.example.com/oauth",
          userCode: "ABCD-1234",
        },
      },
    });

    expect(event?.authorization).toEqual({
      url: "https://idp.example.com/oauth",
      userCode: "ABCD-1234",
    });
  });

  it("ignores successful MCP tool results", () => {
    expect(
      inferMcpAuthorizationRequired({
        toolName: "mcp__linear__list_issues",
        isError: false,
        output: { ok: true },
      }),
    ).toBeUndefined();
  });

  it("ignores non-MCP tool auth failures", () => {
    expect(
      inferMcpAuthorizationRequired({
        toolName: "bash",
        isError: true,
        output: { status: 401, message: "Unauthorized" },
      }),
    ).toBeUndefined();
  });
});