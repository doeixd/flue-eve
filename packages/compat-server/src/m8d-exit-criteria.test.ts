import { describe, expect, it, vi } from "vitest";

import { eveCompat } from "./eve-compat.js";
import { createInProcessAdmission } from "./admission/in-process.js";
import { createLoopbackAdmission } from "./admission/loopback.js";

describe("M8d exit criteria", () => {
  it("M8-6: POST /session routes agent name to admission adapters", async () => {
    const admitTurn = vi.fn(async function* ({ agentName }: { agentName: string }) {
      expect(agentName).toBe("researcher");
      yield { type: "session.waiting" };
    });

    const app = eveCompat({
      agentName: "assistant",
      agents: [
        { name: "assistant", description: "Default", modelId: "claude-sonnet" },
        { name: "researcher", description: "Research", modelId: "claude-haiku" },
      ],
      admission: { admitTurn },
    });

    const res = await app.request("/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Research this", agent: "researcher" }),
    });

    expect(res.status).toBe(202);
    expect(admitTurn).toHaveBeenCalledOnce();
    const callArg = admitTurn.mock.calls[0]?.[0] as { agentName: string } | undefined;
    expect(callArg?.agentName).toBe("researcher");
  });

  it("M8-6: unknown agent returns 400", async () => {
    const app = eveCompat({
      agentName: "assistant",
      agents: [{ name: "assistant", description: "Default", modelId: "claude-sonnet" }],
    });

    const res = await app.request("/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Hi", agent: "ghost" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toContain("ghost");
  });

  it("M8-6: loopback admission routes by input.agentName", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (init?.method === "POST") {
        return Response.json({
          streamUrl: url,
          offset: "-1",
          submissionId: "sub_1",
        });
      }
      return new Response(JSON.stringify([{ type: "idle" }]), {
        headers: {
          "content-type": "application/json",
          "stream-next-offset": "1",
          "stream-up-to-date": "true",
        },
      });
    });

    const admission = createLoopbackAdmission({
      agentName: "assistant",
      baseUrl: "http://127.0.0.1:3583",
      fetch: fetchMock as typeof fetch,
    });

    const events = [];
    for await (const event of admission.admitTurn({
      agentName: "researcher",
      sessionId: "ses_1",
      message: "Hi",
      isFirstTurn: true,
    })) {
      events.push(event);
    }

    const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(calledUrl).toContain("/agents/researcher/ses_1");
    expect(calledUrl).not.toContain("/agents/assistant/");
    expect(events.some((e) => e.type === "idle")).toBe(true);
  });

  it("M8-6: in-process admission routes by input.agentName", async () => {
    const assistantFactory = vi.fn(() => async () => ({ submissionId: "sub_assistant" }));
    const researcherFactory = vi.fn(() => async () => ({ submissionId: "sub_researcher" }));

    const admission = createInProcessAdmission({
      agentName: "assistant",
      hooks: {
        createAdmission: {
          assistant: assistantFactory,
          researcher: researcherFactory,
        },
        eventStreamStore: {
          async getStreamMeta() {
            return { nextOffset: "-1", closed: false };
          },
          async readEvents() {
            return {
              events: [
                { data: { type: "text_delta", text: "hello" }, offset: "1" },
                { data: { type: "idle" }, offset: "2" },
              ],
              nextOffset: "2",
              upToDate: true,
              closed: false,
            };
          },
        },
      },
    });

    const events = [];
    for await (const event of admission.admitTurn({
      agentName: "researcher",
      sessionId: "ses_1",
      message: "Research",
      isFirstTurn: true,
    })) {
      events.push(event);
    }

    expect(assistantFactory).not.toHaveBeenCalled();
    expect(researcherFactory).toHaveBeenCalledOnce();
    expect(events.some((e) => e.type === "idle")).toBe(true);
  });

  it("M8-6: follow-up POST /session/:sessionId can switch agents", async () => {
    const turns: string[] = [];

    const admitTurn = vi.fn(async function* ({ agentName }: { agentName: string }) {
      turns.push(agentName);
      yield { type: "session.waiting" };
    });

    const app = eveCompat({
      agentName: "assistant",
      agents: [
        { name: "assistant", description: "Default", modelId: "claude-sonnet" },
        { name: "researcher", description: "Research", modelId: "claude-haiku" },
      ],
      admission: { admitTurn },
    });

    // First turn: default agent (assistant)
    const createRes = await app.request("/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Hello" }),
    });
    expect(createRes.status).toBe(202);
    const { sessionId, continuationToken } = await createRes.json() as Record<string, string>;

    // Wait for turn to settle
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Second turn: switch to researcher
    const followRes = await app.request(`/session/${sessionId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Research", agent: "researcher", continuationToken }),
    });
    expect(followRes.status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 50));

    // First turn used default, second turn used researcher
    expect(turns).toEqual(["assistant", "researcher"]);
  });

  it("M8-6: follow-up with unknown agent returns 400", async () => {
    const app = eveCompat({
      agentName: "assistant",
      agents: [{ name: "assistant", description: "Default", modelId: "claude-sonnet" }],
    });

    const createRes = await app.request("/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Hi" }),
    });
    const { sessionId, continuationToken } = await createRes.json() as Record<string, string>;
    await new Promise((resolve) => setTimeout(resolve, 50));

    const followRes = await app.request(`/session/${sessionId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Bad", agent: "ghost", continuationToken }),
    });
    expect(followRes.status).toBe(400);
    const body = await followRes.json() as Record<string, unknown>;
    expect(body.error).toContain("ghost");
  });

  it("M8-7: /info documents all registered agents and tools", async () => {
    const app = eveCompat({
      agentName: "assistant",
      agents: [
        { name: "assistant", description: "Default helper", modelId: "claude-sonnet-4-6" },
        { name: "researcher", description: "Research agent", modelId: "claude-haiku-4-5" },
      ],
      tools: [{ name: "get_weather", description: "Get weather for a location" }],
    });

    const res = await app.request("/info");
    expect(res.status).toBe(200);

    const body = await res.json() as Record<string, unknown>;
    expect(body.agent).toEqual({ name: "assistant" });

    const agents = body.agents as Array<Record<string, unknown>>;
    expect(agents).toHaveLength(2);
    expect(agents[0]).toMatchObject({
      name: "assistant",
      description: "Default helper",
      model: { id: "claude-sonnet-4-6" },
    });
    expect(agents[1]).toMatchObject({
      name: "researcher",
      description: "Research agent",
      model: { id: "claude-haiku-4-5" },
    });

    // Each agent should list registered tools
    for (const agent of agents) {
      const tools = agent.tools as Array<Record<string, unknown>>;
      expect(tools.some((t) => t.name === "get_weather")).toBe(true);
    }

    // Top-level tools should be present
    const topTools = body.tools as Array<Record<string, unknown>>;
    expect(topTools.some((t) => t.name === "get_weather")).toBe(true);
  });
});
