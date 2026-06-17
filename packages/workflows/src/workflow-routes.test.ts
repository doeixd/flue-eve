import { describe, expect, it, vi } from "vitest";
import type { EveEvent } from "@flue-eve/shared";
import { createEveWorkflowApp } from "./workflow-routes.js";

describe("createEveWorkflowApp", () => {
  it("POST /eve/v1/runs starts a workflow run and returns 202", async () => {
    const submitRun = vi.fn(async () => ({ runId: "run_01J" }));
    const readStream = vi.fn(async function* (): AsyncGenerator<EveEvent> {
      yield { type: "session.started", data: { sessionId: "run_01J" } };
      yield { type: "session.completed", data: { sessionId: "run_01J" } };
    });

    const app = createEveWorkflowApp({ submitRun, readStream });
    const res = await app.request("/eve/v1/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workflow: "test-workflow", payload: { input: "hello" } }),
    });

    expect(res.status).toBe(202);
    const body = await res.json() as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.runId).toBe("run_01J");
    expect(body.workflow).toBe("test-workflow");
    expect(submitRun).toHaveBeenCalledWith("test-workflow", { input: "hello" });
  });

  it("GET /eve/v1/runs/:runId/stream returns NDJSON event stream", async () => {
    const submitRun = vi.fn(async () => ({ runId: "run_01J" }));
    const readStream = vi.fn(async function* (): AsyncGenerator<EveEvent> {
      yield { type: "session.started", data: { sessionId: "run_01J" } };
      yield { type: "session.waiting", data: {} };
    });

    const app = createEveWorkflowApp({ submitRun, readStream });
    const res = await app.request("/eve/v1/runs/run_01J/stream");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("x-ndjson");
    expect(res.headers.get("x-eve-session-id")).toBe("run_01J");

    const text = await res.text();
    const lines = text.trim().split("\n");
    expect(lines).toHaveLength(2);

    const first = JSON.parse(lines[0]!);
    expect(first.type).toBe("session.started");

    const second = JSON.parse(lines[1]!);
    expect(second.type).toBe("session.waiting");
  });

  it("POST with no workflow name defaults to 'default'", async () => {
    const submitRun = vi.fn(async () => ({ runId: "run_02J" }));
    const readStream = vi.fn(async function* (): AsyncGenerator<EveEvent> {
      yield { type: "session.started", data: { sessionId: "run_02J" } };
    });

    const app = createEveWorkflowApp({ submitRun, readStream });
    const res = await app.request("/eve/v1/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(202);
    expect(submitRun).toHaveBeenCalledWith("default", {});
  });

  it("POST returns 500 when workflow submission fails", async () => {
    const submitRun = vi.fn(async () => {
      throw new Error("Flue unavailable");
    });
    const readStream = vi.fn();

    const app = createEveWorkflowApp({ submitRun, readStream });
    const res = await app.request("/eve/v1/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workflow: "broken" }),
    });

    expect(res.status).toBe(500);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toContain("Flue unavailable");
  });
});
