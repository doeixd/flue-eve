import { afterEach, describe, expect, it } from "vitest";

import {
  mergeMcpHeaders,
  resetConnectModuleCache,
  resolveConnectMcpHeaders,
  resolveConnectProvider,
  type ConnectEveModule,
} from "./vercel-connect.js";

const mockConnectLoader = (): Promise<ConnectEveModule> =>
  Promise.resolve({
    connect: (spec) => ({
      getToken: async () => ({
        token: `token-for-${typeof spec === "string" ? spec : "object"}`,
      }),
      vercelConnect: {
        connector: typeof spec === "string" ? spec : "object",
      },
    }),
  });

afterEach(() => {
  resetConnectModuleCache();
});

describe("resolveConnectMcpHeaders", () => {
  it("returns bearer headers from a Connect-style getToken provider", async () => {
    const headers = await resolveConnectMcpHeaders({
      auth: {
        getToken: async () => ({ token: "connect-token" }),
        vercelConnect: { connector: "oauth/linear" },
      },
      mcp: { url: "https://mcp.linear.app/sse" },
      connectionName: "linear",
    });

    expect(headers).toEqual({ Authorization: "Bearer connect-token" });
  });

  it("returns undefined when getToken throws (OAuth required)", async () => {
    const headers = await resolveConnectMcpHeaders({
      auth: {
        async getToken() {
          throw new Error("authorization required");
        },
      },
      mcp: { url: "https://mcp.linear.app/sse" },
      connectionName: "linear",
    });

    expect(headers).toBeUndefined();
  });

  it("returns undefined for string auth specs when @vercel/connect is not installed", async () => {
    const headers = await resolveConnectMcpHeaders(
      {
        auth: "oauth/linear",
        mcp: { url: "https://mcp.linear.app/sse" },
        connectionName: "linear",
      },
      { loader: async () => Promise.reject(new Error("module not found")) },
    );

    expect(headers).toBeUndefined();
  });

  it("resolves string auth specs via @vercel/connect/eve connect()", async () => {
    const headers = await resolveConnectMcpHeaders(
      {
        auth: "oauth/linear",
        mcp: { url: "https://mcp.linear.app/sse" },
        connectionName: "linear",
      },
      { loader: mockConnectLoader },
    );

    expect(headers).toEqual({ Authorization: "Bearer token-for-oauth/linear" });
  });
});

describe("resolveConnectProvider", () => {
  it("returns object providers unchanged", async () => {
    const provider = { getToken: async () => ({ token: "direct" }) };
    await expect(resolveConnectProvider(provider)).resolves.toBe(provider);
  });

  it("materializes string specs through connect()", async () => {
    const provider = await resolveConnectProvider("oauth/linear", { loader: mockConnectLoader });
    expect(provider?.vercelConnect).toEqual({ connector: "oauth/linear" });
    await expect(provider?.getToken?.({
      connection: { name: "linear", url: "https://mcp.example/sse" },
      principal: { type: "app" },
    })).resolves.toEqual({ token: "token-for-oauth/linear" });
  });
});

describe("mergeMcpHeaders", () => {
  it("overlays connect headers onto static MCP headers", () => {
    const merged = mergeMcpHeaders(
      { "X-Custom": "1" },
      { Authorization: "Bearer connect-token" },
    );

    expect(new Headers(merged).get("X-Custom")).toBe("1");
    expect(new Headers(merged).get("authorization")).toBe("Bearer connect-token");
  });
});