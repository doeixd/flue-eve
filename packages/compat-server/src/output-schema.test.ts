import { describe, expect, it } from "vitest";

import { eveCompat } from "./eve-compat.js";

async function readNdjson(response: Response): Promise<unknown[]> {
  const text = await response.text();
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown);
}

describe("outputSchema end-to-end", () => {
  it("forwards outputSchema and emits result.completed in the stream", async () => {
    const app = eveCompat({ agentName: "assistant" });
    const outputSchema = {
      type: "object",
      properties: { title: { type: "string" } },
      required: ["title"],
    };

    const start = await app.request("/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Summarize", outputSchema }),
    });
    expect(start.status).toBe(202);
    const { sessionId } = (await start.json()) as { sessionId: string };

    await new Promise((resolve) => setTimeout(resolve, 120));

    const events = await readNdjson(await app.request(`/session/${sessionId}/stream`));
    const resultCompleted = events.find(
      (event) => (event as { type: string }).type === "result.completed",
    ) as { data: { result: { title: string } } } | undefined;

    expect(resultCompleted?.data.result.title).toContain("Reply:");
    expect(events.some((event) => (event as { type: string }).type === "session.waiting")).toBe(
      true,
    );
  });
});