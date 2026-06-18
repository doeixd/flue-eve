import { describe, expect, it } from "vitest";

import { createEveWebHandler, createEveWebMiddleware } from "./eve-compat.js";

describe("createEveWebHandler", () => {
  it("returns a web-standard Request/Response handler at /eve/v1 by default", async () => {
    const handler = createEveWebHandler({ agentName: "assistant" });

    const response = await handler(new Request("http://localhost/eve/v1/health"));
    const body = await response.json() as { ok: boolean; agentName: string };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.agentName).toBe("assistant");
  });

  it("can be mounted at a framework-relative root", async () => {
    const handler = createEveWebHandler({ agentName: "assistant" }, { mount: "/" });

    const response = await handler(new Request("http://localhost/health"));
    const body = await response.json() as { ok: boolean };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it("exports createEveWebMiddleware as the same standard handler factory", async () => {
    const handler = createEveWebMiddleware({ agentName: "assistant" }, { mount: "/" });

    const response = await handler(new Request("http://localhost/info"));
    const body = await response.json() as { agent: { name: string } };

    expect(response.status).toBe(200);
    expect(body.agent.name).toBe("assistant");
  });
});
