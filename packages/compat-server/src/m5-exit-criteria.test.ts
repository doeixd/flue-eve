import { createConnectionRegistry, defineFlueConnection } from "@flue-eve/connections";
import { describe, expect, it } from "vitest";

import { createAuthMockAdmission } from "./admission/auth-mock.js";
import { createLinearMcpSuccessAdmission } from "./admission/linear-mcp-mock.js";
import { eveCompat } from "./eve-compat.js";

async function readNdjson(response: Response): Promise<unknown[]> {
  const text = await response.text();
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown);
}

describe("M5 exit criteria", () => {
  it("shows connection__linear__list_issues in the stream for a successful MCP tool call", async () => {
    const app = eveCompat({
      agentName: "assistant",
      admission: createLinearMcpSuccessAdmission(),
    });

    const start = await app.request("/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "List my Linear issues" }),
    });
    const { sessionId } = (await start.json()) as { sessionId: string };

    await new Promise((resolve) => setTimeout(resolve, 120));

    const events = await readNdjson(await app.request(`/session/${sessionId}/stream`));

    const actionRequested = events.find(
      (event) => (event as { type: string }).type === "actions.requested",
    ) as { data: { actions: Array<{ toolName: string }> } } | undefined;
    expect(actionRequested?.data.actions[0]?.toolName).toBe("connection__linear__list_issues");

    const actionResult = events.find(
      (event) => (event as { type: string }).type === "action.result",
    ) as { data: { result: { toolName: string } } } | undefined;
    expect(actionResult?.data.result.toolName).toBe("connection__linear__list_issues");
    expect(events.some((event) => (event as { type: string }).type === "session.waiting")).toBe(
      true,
    );
  });

  it("emits authorization.required with data.authorization.url for OAuth park", async () => {
    const app = eveCompat({
      agentName: "assistant",
      admission: createAuthMockAdmission(),
    });

    const start = await app.request("/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Connect __oauth__" }),
    });
    const { sessionId } = (await start.json()) as { sessionId: string };

    await new Promise((resolve) => setTimeout(resolve, 120));

    const events = await readNdjson(await app.request(`/session/${sessionId}/stream`));
    const authRequired = events.find(
      (event) => (event as { type: string }).type === "authorization.required",
    ) as { data: { authorization: { url: string } } } | undefined;

    expect(authRequired?.data.authorization.url).toBe("https://idp.example.com/oauth/authorize");
    expect(events.some((event) => (event as { type: string }).type === "session.waiting")).toBe(
      false,
    );
  });

  it("lists connection__search and connection tools in /info", async () => {
    const registry = createConnectionRegistry();
    defineFlueConnection(
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

    const app = eveCompat({ agentName: "assistant", connections: registry });
    const body = (await (await app.request("/info")).json()) as {
      tools: Array<{ name: string }>;
    };

    expect(body.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["connection__search", "connection__linear__list_issues"]),
    );
  });
});