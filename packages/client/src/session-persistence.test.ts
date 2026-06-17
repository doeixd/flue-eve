import { describe, expect, it } from "vitest";

import {
  clearSessionState,
  loadSessionState,
  parseSessionStateJson,
  saveSessionState,
  serializeSessionState,
} from "./session-persistence.js";

function createMemoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    key(index: number) {
      return [...data.keys()][index] ?? null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
  };
}

describe("session persistence", () => {
  it("round-trips a full SessionState through storage", () => {
    const storage = createMemoryStorage();
    const state = {
      sessionId: "ses_abc",
      continuationToken: "ctok_abc",
      streamIndex: 12,
    };

    saveSessionState(storage, state);
    expect(loadSessionState(storage)).toEqual(state);
  });

  it("rejects malformed JSON and invalid shapes", () => {
    expect(parseSessionStateJson("not-json")).toBeUndefined();
    expect(parseSessionStateJson("{}")).toBeUndefined();
    expect(parseSessionStateJson(JSON.stringify({ streamIndex: -1 }))).toBeUndefined();
    expect(
      parseSessionStateJson(JSON.stringify({ streamIndex: 0, sessionId: 123 })),
    ).toBeUndefined();
  });

  it("clears storage when sessionId is absent", () => {
    const storage = createMemoryStorage();
    saveSessionState(storage, {
      sessionId: "ses_abc",
      continuationToken: "ctok_abc",
      streamIndex: 3,
    });
    saveSessionState(storage, { streamIndex: 0 });
    expect(loadSessionState(storage)).toBeUndefined();
  });

  it("clearSessionState removes the key", () => {
    const storage = createMemoryStorage();
    storage.setItem("eve-session", serializeSessionState({ streamIndex: 0, sessionId: "ses_1" }));
    clearSessionState(storage);
    expect(storage.getItem("eve-session")).toBeNull();
  });
});