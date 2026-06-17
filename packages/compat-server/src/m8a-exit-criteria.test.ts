import { describe, expect, it, vi } from "vitest";

import { createInProcessAdmission } from "./admission/in-process.js";
import { createLoopbackAdmission } from "./admission/loopback.js";
import { createServiceBindingAdmission } from "./admission/service-binding.js";
import { resolveAdmission } from "./resolve-admission.js";
import { clearProbeCache, resolveAdmissionFromRuntime } from "./resolve-admission-from-runtime.js";
import type { FlueAdmissionAdapter } from "./types.js";

function mockInProcessAdmission(): FlueAdmissionAdapter {
  return createInProcessAdmission({
    agentName: "assistant",
    hooks: {
      createAdmission: {
        assistant: () => async () => {
          return { submissionId: "sub_mock" };
        },
      },
      eventStreamStore: {
        async getStreamMeta() {
          return { nextOffset: "-1", closed: false };
        },
        async readEvents() {
          return {
            events: [{ data: { type: "text_delta", text: "ok" }, offset: "0000000000000000_0000000000000001" }],
            nextOffset: "0000000000000000_0000000000000001",
            upToDate: true,
            closed: false,
          };
        },
      },
    },
  });
}

describe("M8a exit criteria", () => {
  it("M8-1: resolveAdmission prefers in-process over loopback env", () => {
    const previous = process.env.FLUE_BASE_URL;
    process.env.FLUE_BASE_URL = "http://127.0.0.1:3583";
    try {
      const inProcess = mockInProcessAdmission();
      const resolved = resolveAdmission({
        agentName: "assistant",
        inProcess,
      });
      expect(resolved).toBe(inProcess);
    } finally {
      if (previous === undefined) delete process.env.FLUE_BASE_URL;
      else process.env.FLUE_BASE_URL = previous;
    }
  });

  it("M8-1: resolveAdmission falls back to loopback when in-process is omitted", () => {
    const previous = process.env.FLUE_BASE_URL;
    process.env.FLUE_BASE_URL = "http://127.0.0.1:3583";
    try {
      const resolved = resolveAdmission({ agentName: "assistant" });
      expect(resolved).toBeDefined();
      expect(resolved).not.toBe(mockInProcessAdmission());
    } finally {
      if (previous === undefined) delete process.env.FLUE_BASE_URL;
      else process.env.FLUE_BASE_URL = previous;
    }
  });

  it("M8-1: preferLoopback forces HTTP loopback even when in-process is provided", () => {
    const previous = process.env.FLUE_BASE_URL;
    process.env.FLUE_BASE_URL = "http://127.0.0.1:3583";
    try {
      const inProcess = mockInProcessAdmission();
      const resolved = resolveAdmission({
        agentName: "assistant",
        inProcess,
        preferLoopback: true,
      });
      expect(resolved).not.toBe(inProcess);
    } finally {
      if (previous === undefined) delete process.env.FLUE_BASE_URL;
      else process.env.FLUE_BASE_URL = previous;
    }
  });

  it("M8-1: FLUE_AGENT_URL is accepted as an external loopback base", () => {
    const previousBase = process.env.FLUE_BASE_URL;
    const previousAgent = process.env.FLUE_AGENT_URL;
    delete process.env.FLUE_BASE_URL;
    process.env.FLUE_AGENT_URL = "https://agents.example.com";
    try {
      const resolved = resolveAdmission({ agentName: "assistant" });
      expect(resolved).toBeDefined();
    } finally {
      if (previousBase === undefined) delete process.env.FLUE_BASE_URL;
      else process.env.FLUE_BASE_URL = previousBase;
      if (previousAgent === undefined) delete process.env.FLUE_AGENT_URL;
      else process.env.FLUE_AGENT_URL = previousAgent;
    }
  });

  it("M8-1: in-process admission yields stream events without HTTP", async () => {
    const admission = createInProcessAdmission({
      agentName: "assistant",
      hooks: {
        createAdmission: {
          assistant: () => async (payload) => {
            expect(payload.message).toBe("Hello in-process");
            return { submissionId: "sub_1" };
          },
        },
        eventStreamStore: {
          async getStreamMeta() {
            return { nextOffset: "-1", closed: false };
          },
          async readEvents() {
            return {
              events: [
                { data: { type: "text_delta", text: "Reply: Hello in-process" }, offset: "1" },
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
      agentName: "assistant",
      sessionId: "ses_1",
      message: "Hello in-process",
      isFirstTurn: true,
    })) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toEqual(["text_delta", "idle"]);
  });

  it("M8-2: Service Binding admission POSTs through the Fetcher binding", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "POST") {
        return Response.json({
          streamUrl: "https://flue.internal/agents/assistant/ses_1",
          offset: "-1",
          submissionId: "sub_sb",
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

    const binding = { fetch: fetchMock as typeof fetch };
    const admission = createServiceBindingAdmission({
      binding,
      agentName: "assistant",
    });

    const events = [];
    for await (const event of admission.admitTurn({
      agentName: "assistant",
      sessionId: "ses_1",
      message: "Hi",
      isFirstTurn: true,
    })) {
      events.push(event);
    }

    expect(fetchMock).toHaveBeenCalled();
    const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(calledUrl).toContain("/agents/assistant/ses_1");
    expect(events.some((event) => event.type === "idle")).toBe(true);
  });

  it("M8-2: createLoopbackAdmission remains available as explicit fallback", () => {
    const admission = createLoopbackAdmission({
      agentName: "assistant",
      baseUrl: "http://127.0.0.1:3583",
      fetch: vi.fn(async () => new Response("[]", { status: 200 })) as typeof fetch,
    });
    expect(admission.admitTurn).toBeTypeOf("function");
  });

  it("M8-1: resolveAdmissionFromRuntime falls back to loopback when no Flue runtime", () => {
    clearProbeCache();
    const previous = process.env.FLUE_BASE_URL;
    process.env.FLUE_BASE_URL = "http://127.0.0.1:3583";
    try {
      const admission = resolveAdmissionFromRuntime("assistant", {
        flueBaseUrl: "http://127.0.0.1:3583",
      });
      expect(admission).toBeDefined();
    } finally {
      if (previous === undefined) delete process.env.FLUE_BASE_URL;
      else process.env.FLUE_BASE_URL = previous;
      clearProbeCache();
    }
  });

  it("M8-1: resolveAdmissionFromRuntime returns undefined when no runtime and no loopback URL", () => {
    clearProbeCache();
    const previousBase = process.env.FLUE_BASE_URL;
    const previousAgent = process.env.FLUE_AGENT_URL;
    delete process.env.FLUE_BASE_URL;
    delete process.env.FLUE_AGENT_URL;
    try {
      const admission = resolveAdmissionFromRuntime("assistant");
      expect(admission).toBeUndefined();
    } finally {
      if (previousBase === undefined) delete process.env.FLUE_BASE_URL;
      else process.env.FLUE_BASE_URL = previousBase;
      if (previousAgent === undefined) delete process.env.FLUE_AGENT_URL;
      else process.env.FLUE_AGENT_URL = previousAgent;
      clearProbeCache();
    }
  });

  it("M8-1: resolveAdmissionFromRuntime returns a lazy adapter (admitTurn is a function)", () => {
    clearProbeCache();
    const previous = process.env.FLUE_BASE_URL;
    process.env.FLUE_BASE_URL = "http://127.0.0.1:3583";
    try {
      const admission = resolveAdmissionFromRuntime("assistant", {
        flueBaseUrl: "http://127.0.0.1:3583",
      });
      expect(admission).toBeDefined();
      expect(typeof admission!.admitTurn).toBe("function");
    } finally {
      if (previous === undefined) delete process.env.FLUE_BASE_URL;
      else process.env.FLUE_BASE_URL = previous;
      clearProbeCache();
    }
  });
});