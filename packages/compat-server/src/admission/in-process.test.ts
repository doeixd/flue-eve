import { describe, expect, it } from "vitest";

import {
  agentStreamPath,
  consumeInProcessFlueStream,
  createInProcessAdmission,
  type InProcessEventStreamStore,
} from "./in-process.js";

function createMemoryEventStreamStore(): InProcessEventStreamStore & {
  append(path: string, event: unknown): Promise<void>;
} {
  const streams = new Map<
    string,
    { events: Array<{ data: unknown; offset: string }>; nextSeq: number; closed: boolean }
  >();

  function stream(path: string) {
    let entry = streams.get(path);
    if (!entry) {
      entry = { events: [], nextSeq: 0, closed: false };
      streams.set(path, entry);
    }
    return entry;
  }

  function formatOffset(sequence: number): string {
    return `0000000000000000_${String(sequence).padStart(16, "0")}`;
  }

  return {
    async append(path, event) {
      const s = stream(path);
      s.nextSeq += 1;
      s.events.push({ data: event, offset: formatOffset(s.nextSeq) });
    },
    async getStreamMeta(path) {
      const s = streams.get(path);
      if (!s || s.events.length === 0) return { nextOffset: "-1", closed: s?.closed ?? false };
      const last = s.events.at(-1);
      return { nextOffset: last?.offset ?? "-1", closed: s.closed };
    },
    async readEvents(path, opts) {
      const s = stream(path);
      const offset = opts?.offset ?? "-1";
      const startSeq = offset === "-1" ? 0 : Number.parseInt(offset.split("_")[1] ?? "0", 10);
      const batch = s.events.filter((entry) => {
        const seq = Number.parseInt(entry.offset.split("_")[1] ?? "0", 10);
        return seq > startSeq;
      });
      const nextOffset = batch.at(-1)?.offset ?? offset;
      return {
        events: batch,
        nextOffset,
        upToDate: batch.length > 0 || s.closed,
        closed: s.closed,
      };
    },
  };
}

describe("createInProcessAdmission", () => {
  it("admits via createAdmission and yields events from the event stream store", async () => {
    const store = createMemoryEventStreamStore();
    const path = agentStreamPath("assistant", "ses_1");

    const admission = createInProcessAdmission({
      agentName: "assistant",
      hooks: {
        createAdmission: {
          assistant: (id) => async (payload) => {
            expect(id).toBe("ses_1");
            expect(payload.message).toBe("Hello");
            const submissionId = "sub_1";
            await store.append(path, { type: "text_delta", text: "Hi" });
            await store.append(path, { type: "idle", submissionId });
            return { submissionId };
          },
        },
        eventStreamStore: store,
      },
    });

    const events = [];
    for await (const event of admission.admitTurn({
      agentName: "assistant",
      sessionId: "ses_1",
      message: "Hello",
      isFirstTurn: true,
    })) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toEqual(["text_delta", "idle"]);
  });

  it("yields agent_not_found when createAdmission has no factory for the agent", async () => {
    const store = createMemoryEventStreamStore();
    const admission = createInProcessAdmission({
      agentName: "missing",
      hooks: { createAdmission: {}, eventStreamStore: store },
    });

    const events = [];
    for await (const event of admission.admitTurn({
      agentName: "missing",
      sessionId: "ses_1",
      message: "Hello",
      isFirstTurn: true,
    })) {
      events.push(event);
    }

    expect(events).toEqual([
      {
        type: "error",
        message: 'Agent "missing" is not registered for in-process admission.',
        code: "agent_not_found",
      },
    ]);
  });
});

describe("consumeInProcessFlueStream", () => {
  it("stops at submission_settled for the admitted submission", async () => {
    const store = createMemoryEventStreamStore();
    const path = agentStreamPath("assistant", "ses_2");
    await store.append(path, { type: "text_delta", text: "A" });
    await store.append(path, {
      type: "submission_settled",
      submissionId: "sub_9",
      outcome: "completed",
    });
    await store.append(path, { type: "text_delta", text: "B" });

    const events = [];
    for await (const event of consumeInProcessFlueStream({
      eventStreamStore: store,
      streamPath: path,
      offset: "-1",
      submissionId: "sub_9",
    })) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toEqual(["text_delta", "submission_settled"]);
  });
});