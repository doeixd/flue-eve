import { afterEach, describe, expect, it, vi } from "vitest";

import { ClientError } from "./client-error.js";
import { openStreamBody } from "./open-stream.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("openStreamBody", () => {
  it("does not retry non-retryable 400 responses", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response('{"ok":false}', { status: 400 }));

    await expect(
      openStreamBody({
        host: "http://localhost:3000",
        resolveHeaders: async () => new Headers(),
        sessionId: "session_1",
        startIndex: 0,
      }),
    ).rejects.toBeInstanceOf(ClientError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries retryable 409 responses before succeeding", async () => {
    const encoder = new TextEncoder();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("busy", { status: 409 }))
      .mockResolvedValueOnce(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(
                encoder.encode('{"type":"session.waiting","data":{"wait":"next-user-message"}}\n'),
              );
              controller.close();
            },
          }),
          { status: 200 },
        ),
      );

    const body = await openStreamBody({
      host: "http://localhost:3000",
      resolveHeaders: async () => new Headers(),
      sessionId: "session_1",
      startIndex: 3,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("startIndex=3");

    const text = await new Response(body).text();
    expect(text).toContain("session.waiting");
  });
});

describe("openStreamBody startIndex", () => {
  it("omits startIndex from the URL when replaying from zero", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.close();
          },
        }),
        { status: 200 },
      ),
    );

    await openStreamBody({
      host: "http://localhost:3000",
      resolveHeaders: async () => new Headers(),
      sessionId: "session_1",
      startIndex: 0,
    });

    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("startIndex=");
  });
});