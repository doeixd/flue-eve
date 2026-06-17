import { describe, expect, it, vi } from "vitest";

import { eveCompat } from "./eve-compat.js";

describe("M8b exit criteria", () => {
  it("routes POST /session to a named agent and stores the session agent", async () => {
    const admitTurn = vi.fn(async function* ({ agentName }) {
      expect(agentName).toBe("researcher");
      yield { type: "session.waiting" };
    });

    const app = eveCompat({
      agentName: "assistant",
      agents: [
        { name: "assistant", description: "Default helper", modelId: "anthropic/claude-sonnet-4-6" },
        { name: "researcher", description: "Research agent", modelId: "anthropic/claude-haiku-4-5" },
      ],
      admission: {
        admitTurn,
      },
    });

    const response = await app.request("/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Find facts", agent: "researcher" }),
    });

    expect(response.status).toBe(202);
    const payload = await response.json();
    expect(payload).toMatchObject({ ok: true });
    expect(admitTurn).toHaveBeenCalledTimes(1);

    const sessionId = (payload as { sessionId: string }).sessionId;
    await new Promise((resolve) => setTimeout(resolve, 50));
    const debug = await app.request(`/debug/journal/${sessionId}`);
    const debugBody = await debug.json();
    expect(debugBody.status).toBe("waiting");
  });

  it("exposes the registered agents in /info", async () => {
    const app = eveCompat({
      agentName: "assistant",
      agents: [
        { name: "assistant", description: "Default helper", modelId: "anthropic/claude-sonnet-4-6" },
        { name: "researcher", description: "Research agent", modelId: "anthropic/claude-haiku-4-5" },
      ],
    });

    const response = await app.request("/info");
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toMatchObject({
      agent: { name: "assistant" },
      agents: [
        {
          name: "assistant",
          description: "Default helper",
          model: { id: "anthropic/claude-sonnet-4-6" },
        },
        {
          name: "researcher",
          description: "Research agent",
          model: { id: "anthropic/claude-haiku-4-5" },
        },
      ],
    });
  });
});
