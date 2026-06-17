import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { eveCompat } from "./eve-compat.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("eve HTTP contract fixtures", () => {
  it("GET /health matches fixtures/eve-contract/health.json shape", async () => {
    const expected = JSON.parse(
      await readFile(join(root, "fixtures/eve-contract/health.json"), "utf8"),
    ) as Record<string, unknown>;

    const app = eveCompat({ agentName: "assistant" });
    const response = await app.request("/health");
    const body = (await response.json()) as Record<string, unknown>;

    expect(body.ok).toBe(expected.ok);
    expect(body.status).toBe(expected.status);
    expect(typeof body.workflowId).toBe("string");
  });

  it("POST /session returns 202 with Eve session fields", async () => {
    const app = eveCompat({ agentName: "assistant" });
    const response = await app.request("/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Hello" }),
    });

    expect(response.status).toBe(202);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(typeof body.sessionId).toBe("string");
    expect(String(body.sessionId)).toMatch(/^ses_/);
    expect(typeof body.continuationToken).toBe("string");
    expect(String(body.continuationToken)).toMatch(/^eve:/);
  });
});