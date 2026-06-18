import { describe, expect, it, vi, beforeEach } from "vitest";

// Hoisted mocks for runtime plugin dependencies
vi.mock("h3", () => ({
  fromWebHandler: vi.fn((handler: any) => handler),
}));

vi.mock("@flue-eve/compat-server", () => ({
  createEveWebHandler: vi.fn(),
  resolveAdmission: vi.fn(),
}));

describe("eveNitro", () => {
  it("returns an object with vite.plugins and plugins array", async () => {
    const { eveNitro } = await import("./index.js");
    const result = eveNitro();
    expect(result).toBeDefined();
    expect(result.vite).toBeDefined();
    expect(Array.isArray(result.vite!.plugins)).toBe(true);
    expect(result.plugins).toBeDefined();
    expect(Array.isArray(result.plugins)).toBe(true);
  });

  it("includes a Vite plugin named 'flue-eve'", async () => {
    const { eveNitro } = await import("./index.js");
    const result = eveNitro({ agentName: "test-agent" });
    expect(result.vite!.plugins.length).toBeGreaterThanOrEqual(1);
    const plugin = result.vite!.plugins[0]!;
    expect(plugin.name).toBe("flue-eve");
  });

  it("includes the runtime plugin path", async () => {
    const { eveNitro } = await import("./index.js");
    const result = eveNitro();
    expect(result.plugins).toContain("@flue-eve/nitro/runtime-plugin");
  });

  it("passes options through to the Vite plugin", async () => {
    const { eveNitro } = await import("./index.js");
    const result = eveNitro({ agentName: "nitro-assistant", fluePort: 3584 });
    const plugin = result.vite!.plugins[0]!;
    expect(plugin.name).toBe("flue-eve");
    expect(result.plugins).toContain("@flue-eve/nitro/runtime-plugin");
  });

  it("eveNitro result spreads into NitroConfig", async () => {
    const { eveNitro } = await import("./index.js");
    const result = eveNitro();
    const nitroConfig = {
      debug: true,
      ...result,
    };
    expect(nitroConfig.vite).toBeDefined();
    expect(nitroConfig.plugins).toBeDefined();
    expect(nitroConfig.debug).toBe(true);
  });
});

describe("runtime plugin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockNitroApp = () => ({
    h3App: { use: vi.fn() },
    router: {},
    hooks: { hook: vi.fn(), callHook: vi.fn(), callHookParallel: vi.fn() },
    localCall: vi.fn(),
    localFetch: vi.fn(),
    captureError: vi.fn(),
  });

  it("mounts eveCompat on h3App.use with default env", async () => {
    const { createEveWebHandler, resolveAdmission } = await import("@flue-eve/compat-server");
    const { fromWebHandler } = await import("h3");
    vi.mocked(createEveWebHandler).mockReturnValue(vi.fn() as any);
    vi.mocked(resolveAdmission).mockReturnValue({} as any);

    const mod = await import("./runtime-plugin.js");
    mod.default(mockNitroApp());

    expect(resolveAdmission).toHaveBeenCalledWith({ agentName: "assistant" });
    expect(createEveWebHandler).toHaveBeenCalledWith({
      agentName: "assistant",
      admission: {},
    }, { mount: "/" });
    expect(fromWebHandler).toHaveBeenCalledOnce();
  });

  it("reads FLUE_AGENT_NAME and FLUE_EVE_MOUNT from env", async () => {
    process.env.FLUE_AGENT_NAME = "env-agent";
    process.env.FLUE_EVE_MOUNT = "/custom/eve";

    const { createEveWebHandler, resolveAdmission } = await import("@flue-eve/compat-server");
    vi.mocked(createEveWebHandler).mockReturnValue(vi.fn() as any);
    vi.mocked(resolveAdmission).mockReturnValue({} as any);

    const mod = await import("./runtime-plugin.js");
    const nitroApp = mockNitroApp();
    mod.default(nitroApp);

    expect(resolveAdmission).toHaveBeenCalledWith({ agentName: "env-agent" });
    expect(createEveWebHandler).toHaveBeenCalledWith({
      agentName: "env-agent",
      admission: {},
    }, { mount: "/" });
    expect(nitroApp.h3App.use).toHaveBeenCalledWith("/custom/eve", expect.any(Function));

    delete process.env.FLUE_AGENT_NAME;
    delete process.env.FLUE_EVE_MOUNT;
  });

  it("passes the web-standard handler to fromWebHandler", async () => {
    const { createEveWebHandler, resolveAdmission } = await import("@flue-eve/compat-server");
    const { fromWebHandler } = await import("h3");

    const handler = vi.fn(async () => new Response(
      '{"ok":true}',
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    vi.mocked(createEveWebHandler).mockReturnValue(handler as any);
    vi.mocked(resolveAdmission).mockReturnValue({} as any);

    const mod = await import("./runtime-plugin.js");
    const nitroApp = mockNitroApp();
    mod.default(nitroApp);

    // fromWebHandler is mocked as identity: (h) => h
    // So h3App.use was called with the raw callback
    const rawCallback = vi.mocked(fromWebHandler).mock.calls[0]![0]! as (req: Request) => Promise<Response>;

    const req = new Request("http://localhost/eve/v1/health");
    const result = await rawCallback(req);

    expect(handler).toHaveBeenCalledTimes(1);
    const callArg = handler.mock.calls[0]![0]! as Request;
    expect(callArg.url).toBe("http://localhost/eve/v1/health");
    expect(result).toBeInstanceOf(Response);
    expect(await result.json()).toEqual({ ok: true });
  });

  it("registers route at h3App level for catch-all matching", async () => {
    const { createEveWebHandler, resolveAdmission } = await import("@flue-eve/compat-server");
    vi.mocked(createEveWebHandler).mockReturnValue(vi.fn() as any);
    vi.mocked(resolveAdmission).mockReturnValue({} as any);

    const mod = await import("./runtime-plugin.js");
    const nitroApp = mockNitroApp();
    mod.default(nitroApp);

    expect(nitroApp.h3App.use).toHaveBeenCalledWith(
      "/eve/v1",
      expect.any(Function),
    );

    const route = nitroApp.h3App.use.mock.calls[0]![0]!;
    expect(route).toBe("/eve/v1");
  });
});
