import { describe, expect, it, vi } from "vitest";
import { createEveWorkflowApp } from "@flue-eve/workflows";
import { createEveChannelBridge } from "@flue-eve/channels";
import type { EveEvent } from "@flue-eve/shared";

describe("M8e — Workflows (@flue-eve/workflows)", () => {
  it("starts a workflow run via POST /eve/v1/runs", async () => {
    const submitRun = vi.fn(async () => ({ runId: "wf_run_01" }));
    const readStream = vi.fn(async function* (): AsyncGenerator<EveEvent> {});
    const app = createEveWorkflowApp({ submitRun, readStream });

    const res = await app.request("/eve/v1/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workflow: "weather", payload: { city: "Berlin" } }),
    });

    expect(res.status).toBe(202);
    const body = await res.json() as { ok: boolean; runId: string; workflow: string };
    expect(body.ok).toBe(true);
    expect(body.runId).toBe("wf_run_01");
    expect(body.workflow).toBe("weather");
    expect(submitRun).toHaveBeenCalledWith("weather", { city: "Berlin" });
  });

  it("streams workflow run events as NDJSON via GET /eve/v1/runs/:runId/stream", async () => {
    const submitRun = vi.fn(async () => ({ runId: "wf_run_02" }));
    const readStream = vi.fn(async function* (): AsyncGenerator<EveEvent> {
      yield { type: "session.started", data: { sessionId: "wf_run_02" } };
      yield { type: "message.completed", data: { role: "assistant", content: "done" } };
    });
    const app = createEveWorkflowApp({ submitRun, readStream });

    const res = await app.request("/eve/v1/runs/wf_run_02/stream");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("x-ndjson");
    const text = await res.text();
    const lines = text.trim().split("\n");
    expect(JSON.parse(lines[0]!).type).toBe("session.started");
    expect(JSON.parse(lines[1]!).type).toBe("message.completed");
  });

  it("returns 500 when workflow submission fails", async () => {
    const submitRun = vi.fn(async () => { throw new Error("Flue error"); });
    const readStream = vi.fn();
    const app = createEveWorkflowApp({ submitRun, readStream });

    const res = await app.request("/eve/v1/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workflow: "fail" }),
    });

    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: string }).error).toContain("Workflow submission failed");
  });
});

describe("M8e — Channels (@flue-eve/channels)", () => {
  it("dispatches a channel event to an Eve session via POST", async () => {
    const dispatch = vi.fn(async () => ({ sessionId: "ses_ch_01", continuationToken: "tok_01" }));
    const readStream = vi.fn();
    const app = createEveChannelBridge({ dispatch, readStream });

    const res = await app.request("/eve/v1/channels/slack/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Hello from Slack" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; sessionId: string; continuationToken?: string };
    expect(body.ok).toBe(true);
    expect(body.sessionId).toBe("ses_ch_01");
    expect(body.continuationToken).toBe("tok_01");
    expect(dispatch).toHaveBeenCalledWith({
      channelName: "slack",
      message: "Hello from Slack",
    });
  });

  it("forwards sessionId when resuming a channel session", async () => {
    const dispatch = vi.fn(async () => ({ sessionId: "ses_ch_02" }));
    const readStream = vi.fn();
    const app = createEveChannelBridge({ dispatch, readStream });

    await app.request("/eve/v1/channels/discord/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Reply", sessionId: "ses_ch_02", metadata: { channelId: "123" } }),
    });

    expect(dispatch).toHaveBeenCalledWith({
      channelName: "discord",
      sessionId: "ses_ch_02",
      message: "Reply",
      metadata: { channelId: "123" },
    });
  });

  it("streams channel session events as NDJSON", async () => {
    const dispatch = vi.fn();
    const readStream = vi.fn(async function* (): AsyncGenerator<EveEvent> {
      yield { type: "session.started", data: { sessionId: "ses_ch_03" } };
    });
    const app = createEveChannelBridge({ dispatch, readStream });

    const res = await app.request("/eve/v1/channels/web/session/ses_ch_03/stream");

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text.trim().split("\n")[0]!).type).toBe("session.started");
  });

  it("returns 400 when channel event has no message", async () => {
    const dispatch = vi.fn();
    const readStream = vi.fn();
    const app = createEveChannelBridge({ dispatch, readStream });

    const res = await app.request("/eve/v1/channels/slack/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });
});
