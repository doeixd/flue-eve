import { createConnectionRegistry, defineFlueConnection } from "@flue-eve/connections";
import { describe, expect, it } from "vitest";

import { createAuthMockAdmission } from "./admission/auth-mock.js";
import { eveCompat } from "./eve-compat.js";

async function readNdjson(response: Response): Promise<unknown[]> {
  const text = await response.text();
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown);
}

describe("eveCompat connections shim", () => {
  it("lists connections and connection__search in /info", async () => {
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
    const response = await app.request("/info");
    const body = (await response.json()) as {
      connections: Array<{ name: string }>;
      tools: Array<{ name: string }>;
    };

    expect(body.connections).toEqual([
      { name: "linear", description: "Linear workspace" },
    ]);
    expect(body.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["connection__search", "connection__linear__list_issues"]),
    );
  });

  it("parks on authorization.required and resumes after OAuth callback", async () => {
    // OAuth park keeps session active; NDJSON closes when pendingAuthorization is set.
    const app = eveCompat({
      agentName: "assistant",
      admission: createAuthMockAdmission(),
    });

    const start = await app.request("/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Connect __oauth__" }),
    });
    const { sessionId, continuationToken } = (await start.json()) as {
      sessionId: string;
      continuationToken: string;
    };

    await new Promise((resolve) => setTimeout(resolve, 150));

    const stream1 = await readNdjson(await app.request(`/session/${sessionId}/stream`));
    const authRequired = stream1.find(
      (event) => (event as { type: string }).type === "authorization.required",
    ) as { data: { authorization: { url: string } } } | undefined;

    expect(authRequired?.data.authorization.url).toBe("https://idp.example.com/oauth/authorize");
    expect(stream1.some((event) => (event as { type: string }).type === "session.waiting")).toBe(
      false,
    );

    const callback = await app.request(
      `/connections/linear/callback?sessionId=${encodeURIComponent(sessionId)}`,
    );
    expect(callback.status).toBe(200);

    const streamAfterCallback = await readNdjson(
      await app.request(`/session/${sessionId}/stream?startIndex=${stream1.length}`),
    );
    expect(
      streamAfterCallback.some(
        (event) => (event as { type: string }).type === "authorization.completed",
      ),
    ).toBe(true);
    expect(
      streamAfterCallback.some((event) => (event as { type: string }).type === "session.waiting"),
    ).toBe(true);

    const resume = await app.request(`/session/${sessionId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        continuationToken,
        message: "__oauth_complete__",
      }),
    });
    expect(resume.status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 150));

    const stream2 = await readNdjson(
      await app.request(
        `/session/${sessionId}/stream?startIndex=${stream1.length + streamAfterCallback.length}`,
      ),
    );
    expect(
      stream2.some((event) => (event as { type: string }).type === "message.appended"),
    ).toBe(true);
  });
});