import type { HandleMessageStreamEvent } from "./types.js";

export function isStreamDisconnectError(error: unknown): boolean {
  if (error instanceof DOMException) return error.name === "AbortError";
  if (!(error instanceof Error)) return false;
  const errorCode = "code" in error && typeof error.code === "string" ? error.code : undefined;
  return (
    error.name === "AbortError" ||
    error.message === "terminated" ||
    errorCode === "UND_ERR_SOCKET" ||
    /abort|cancel|disconnect|premature close|socket|terminated/i.test(error.message)
  );
}

const MAX_LINE_LENGTH = 5 * 1024 * 1024;

export async function* readNdjsonStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<HandleMessageStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const result = await reader.read();
      if (result.done) {
        buffer += decoder.decode();
        break;
      }
      if (result.value) buffer += decoder.decode(result.value, { stream: true });

      if (buffer.length > MAX_LINE_LENGTH && !buffer.includes("\n")) {
        reader.cancel();
        throw new Error(`NDJSON line exceeded maximum length of ${MAX_LINE_LENGTH} bytes`);
      }

      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line.length > 0) yield JSON.parse(line) as HandleMessageStreamEvent;
        newlineIndex = buffer.indexOf("\n");
      }
    }

    const trailing = buffer.trim();
    if (trailing.length > 0) yield JSON.parse(trailing) as HandleMessageStreamEvent;
  } finally {
    reader.cancel().catch(() => {});
  }
}