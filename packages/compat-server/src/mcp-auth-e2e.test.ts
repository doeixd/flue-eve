import { describe, expect, it } from "vitest";

import { createMcpAuthFailureAdmission } from "./admission/mcp-auth-mock.js";
import { eveCompat } from "./eve-compat.js";

async function readNdjson(response: Response): Promise<unknown[]> {
  const text = await response.text();
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown);
}

describe("live MCP 401 → authorization.required", () => {
  it("parks the session when an MCP tool returns 401", async () => {
    const app = eveCompat({
      agentName: "assistant",
      admission: createMcpAuthFailureAdmission(),
    });

    const start = await app.request("/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "List Linear issues" }),
    });
    const { sessionId } = (await start.json()) as { sessionId: string };

    await new Promise((resolve) => setTimeout(resolve, 120));

    const events = await readNdjson(await app.request(`/session/${sessionId}/stream`));
    expect(events.some((event) => (event as { type: string }).type === "authorization.required")).toBe(
      true,
    );
    expect(events.some((event) => (event as { type: string }).type === "session.waiting")).toBe(false);

    const debug = await app.request(`/debug/journal/${sessionId}`);
    const journal = (await debug.json()) as { status: string };
    expect(journal.status).toBe("active");
  });
});