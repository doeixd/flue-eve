import { afterEach, describe, expect, it, vi } from "vitest";

import { createConnectionRegistry, defineFlueConnection } from "./index.js";
import { resetConnectModuleCache } from "./vercel-connect.js";

const connectMcpServer = vi.fn();

vi.mock("@flue/runtime", () => ({
  connectMcpServer: (...args: unknown[]) => connectMcpServer(...args),
}));

vi.mock("@vercel/connect/eve", () => ({
  connect: (spec: string) => ({
    getToken: async () => ({ token: `token-for-${spec}` }),
    vercelConnect: { connector: spec },
  }),
}));

afterEach(() => {
  connectMcpServer.mockReset();
  resetConnectModuleCache();
});

describe("defineFlueConnection", () => {
  it("merges Connect bearer headers into MCP connect options", async () => {
    connectMcpServer.mockResolvedValue({
      tools: [
        {
          name: "mcp__linear__list_issues",
          description: "List issues",
          parameters: { type: "object" },
        },
      ],
      close: async () => {},
    });

    const registry = createConnectionRegistry();
    const connection = defineFlueConnection(
      {
        name: "linear",
        description: "Linear workspace",
        mcp: {
          url: "https://mcp.linear.app/sse",
          headers: { "X-Custom": "1" },
        },
        auth: {
          getToken: async () => ({ token: "connect-token" }),
        },
      },
      registry,
    );

    await connection.tools();

    expect(connectMcpServer).toHaveBeenCalledWith(
      "linear",
      expect.objectContaining({
        url: "https://mcp.linear.app/sse",
        headers: expect.any(Headers),
      }),
    );

    const headers = connectMcpServer.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get("X-Custom")).toBe("1");
    expect(headers.get("authorization")).toBe("Bearer connect-token");
  });

  it("resolves connect(\"oauth/linear\") string auth via dynamic import", async () => {
    connectMcpServer.mockResolvedValue({
      tools: [
        {
          name: "mcp__linear__list_issues",
          description: "List issues",
          parameters: { type: "object" },
        },
      ],
      close: async () => {},
    });

    const registry = createConnectionRegistry();
    const connection = defineFlueConnection(
      {
        name: "linear",
        description: "Linear workspace",
        mcp: { url: "https://mcp.linear.app/sse" },
        auth: "oauth/linear",
      },
      registry,
    );

    await connection.tools();

    const headers = new Headers(connectMcpServer.mock.calls[0]?.[1]?.headers as HeadersInit);
    expect(headers.get("authorization")).toBe("Bearer token-for-oauth/linear");
  });

  it("uses static tool catalogs without calling connectMcpServer", async () => {
    const registry = createConnectionRegistry();
    const connection = defineFlueConnection(
      {
        name: "linear",
        description: "Linear workspace",
        tools: [
          {
            name: "list_issues",
            description: "List issues",
            qualifiedName: "connection__linear__list_issues",
          },
        ],
      },
      registry,
    );

    const tools = await connection.tools();
    expect(tools).toHaveLength(1);
    expect(connectMcpServer).not.toHaveBeenCalled();
  });
});