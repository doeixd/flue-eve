import { describe, expect, it } from "vitest";

import { isStreamDisconnectError, readNdjsonStream } from "./ndjson.js";

async function collect<T>(stream: ReadableStream<Uint8Array>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of readNdjsonStream(stream)) items.push(item as T);
  return items;
}

describe("readNdjsonStream", () => {
  it("parses events split across chunk boundaries", async () => {
    const encoder = new TextEncoder();
    const part1 = encoder.encode('{"type":"turn.started","data":{');
    const part2 = encoder.encode('}}\n{"type":"session.waiting","data":{}}\n');

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(part1);
        controller.enqueue(part2);
        controller.close();
      },
    });

    const events = await collect<{ type: string }>(stream);
    expect(events.map((event) => event.type)).toEqual(["turn.started", "session.waiting"]);
  });

  it("parses a trailing line without a newline", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"type":"session.waiting","data":{}}'));
        controller.close();
      },
    });

    const events = await collect<{ type: string }>(stream);
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("session.waiting");
  });

  it("throws when a line contains invalid JSON", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"type":"session.waiting","data":{}}\n'));
        controller.enqueue(encoder.encode("not-json\n"));
        controller.close();
      },
    });

    const iterator = readNdjsonStream(stream)[Symbol.asyncIterator]();
    await iterator.next();
    await expect(iterator.next()).rejects.toThrow();
  });

  it("skips blank lines between events", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode('\n{"type":"turn.started","data":{}}\n\n{"type":"session.waiting","data":{}}\n'),
        );
        controller.close();
      },
    });

    const events = await collect<{ type: string }>(stream);
    expect(events.map((event) => event.type)).toEqual(["turn.started", "session.waiting"]);
  });
  it("rejects buffer that grows beyond max line length without a newline", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("x".repeat(5 * 1024 * 1024 + 1)));
        controller.close();
      },
    });

    const iterator = readNdjsonStream(stream);
    await expect(iterator.next()).rejects.toThrow(/exceeded maximum length/);
  });
});

describe("isStreamDisconnectError", () => {
  it("treats common disconnect errors as retryable", () => {
    expect(isStreamDisconnectError(new TypeError("terminated"))).toBe(true);
    expect(isStreamDisconnectError(new Error("socket hang up"))).toBe(true);
    expect(isStreamDisconnectError(new DOMException("aborted", "AbortError"))).toBe(true);
  });

  it("does not treat application errors as disconnects", () => {
    expect(isStreamDisconnectError(new Error("Unexpected token"))).toBe(false);
    expect(isStreamDisconnectError("terminated")).toBe(false);
  });
});