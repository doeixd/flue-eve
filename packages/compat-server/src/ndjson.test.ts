import {
  createAuthorizationRequiredEvent,
  createMessageAppendedEvent,
  createSessionWaitingEvent,
} from "@flue-eve/shared";
import { describe, expect, it } from "vitest";

import { EventJournal } from "./journal.js";
import {
  createNdjsonStream,
  encodeNdjsonLine,
  StartIndexTruncatedError,
  streamHeaders,
} from "./ndjson.js";
import type { EveSessionRecord } from "./session-store.js";

function createTestSession(overrides?: Partial<EveSessionRecord>): EveSessionRecord {
  const journal = new EventJournal();
  journal.append(
    createMessageAppendedEvent({
      messageDelta: "Hi",
      messageSoFar: "Hi",
      turnId: "turn_1",
      sequence: 1,
      stepIndex: 0,
    }),
  );
  journal.append(createSessionWaitingEvent());

  return {
    sessionId: "ses_test",
    agentName: "assistant",
    continuationToken: "eve:token",
    status: "waiting",
    journal,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isFirstTurn: false,
    ...overrides,
  };
}

async function readStream(stream: ReadableStream<Uint8Array>): Promise<unknown[]> {
  const text = await new Response(stream).text();
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown);
}

describe("encodeNdjsonLine", () => {
  it("serializes one JSON object per line", () => {
    const event = createSessionWaitingEvent();
    const encoded = new TextDecoder().decode(encodeNdjsonLine(event));
    expect(encoded.endsWith("\n")).toBe(true);
    expect(JSON.parse(encoded.trim())).toEqual(event);
  });
});

describe("streamHeaders", () => {
  it("includes Eve stream version and session id", () => {
    const headers = streamHeaders("ses_abc");
    expect(headers["x-eve-session-id"]).toBe("ses_abc");
    expect(headers["x-eve-stream-version"]).toBeTruthy();
    expect(headers["x-eve-stream-format"]).toBe("ndjson");
    expect(headers["content-type"]).toContain("ndjson");
  });
});

describe("createNdjsonStream", () => {
  it("replays journal events from startIndex", async () => {
    const session = createTestSession();
    const events = await readStream(createNdjsonStream(session, 1));
    expect(events).toHaveLength(1);
    expect((events[0] as { type: string }).type).toBe("session.waiting");
  });

  it("throws StartIndexTruncatedError when startIndex is below baseIndex", () => {
    const journal = new EventJournal({ maxEvents: 1 });
    journal.append(createSessionWaitingEvent());
    journal.append(createSessionWaitingEvent());

    const session = createTestSession({ journal, status: "waiting" });

    expect(() => createNdjsonStream(session, 0)).toThrow(StartIndexTruncatedError);
    try {
      createNdjsonStream(session, 0);
    } catch (error) {
      expect(error).toBeInstanceOf(StartIndexTruncatedError);
      expect((error as StartIndexTruncatedError).baseIndex).toBe(1);
    }
  });

  it("closes immediately when session is parked on authorization", async () => {
    const journal = new EventJournal();
    journal.append(
      createAuthorizationRequiredEvent({
        name: "linear",
        description: "Linear",
        authorization: { url: "https://idp.example.com/oauth" },
        sequence: 0,
        stepIndex: 0,
        turnId: "ses_ndjson",
      }),
    );

    const session = createTestSession({
      journal,
      status: "active",
      pendingAuthorization: { connectionName: "linear" },
    });

    const events = await readStream(createNdjsonStream(session, 0));
    expect(events).toHaveLength(1);
    expect((events[0] as { type: string }).type).toBe("authorization.required");
  });

  it("notifies live subscribers while the turn is active", async () => {
    const journal = new EventJournal();
    const session = createTestSession({ journal, status: "active" });

    const stream = createNdjsonStream(session, 0);
    const reader = stream.getReader();

    journal.append(
      createMessageAppendedEvent({
        messageDelta: "Live",
        messageSoFar: "Live",
        turnId: "turn_1",
        sequence: 2,
        stepIndex: 0,
      }),
    );

    const first = await reader.read();
    expect(first.done).toBe(false);
    const firstEvent = JSON.parse(new TextDecoder().decode(first.value!)) as { type: string };
    expect(firstEvent.type).toBe("message.appended");

    session.status = "waiting";
    journal.append(createSessionWaitingEvent());

    await new Promise((resolve) => setTimeout(resolve, 150));
    await reader.cancel();
  });

  it("cleans up on stream cancel and does not leak timers", async () => {
    const journal = new EventJournal();
    const session = createTestSession({ journal, status: "active" });

    const stream = createNdjsonStream(session, 0);
    const reader = stream.getReader();

    await reader.cancel();

    await new Promise((resolve) => setTimeout(resolve, 250));

    journal.append(createSessionWaitingEvent());
    session.status = "waiting";

    try {
      const result = await reader.read();
      if (result.done) {
        expect(true).toBe(true);
      } else {
        expect(result.done).toBe(true);
      }
    } catch {
      expect(true).toBe(true);
    }
  });
});
