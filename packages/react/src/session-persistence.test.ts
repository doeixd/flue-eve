import { describe, expect, it } from "vitest";

import { createEveSessionPersistence } from "./session-persistence.js";

function createMemoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    data,
  };
}

describe("createEveSessionPersistence", () => {
  it("loads initial session and persists cursor updates", () => {
    const storage = createMemoryStorage();
    storage.setItem(
      "eve-session",
      JSON.stringify({
        sessionId: "ses_saved",
        continuationToken: "ctok_saved",
        streamIndex: 4,
      }),
    );

    const persistence = createEveSessionPersistence({ storage });
    expect(persistence.initialSession).toEqual({
      sessionId: "ses_saved",
      continuationToken: "ctok_saved",
      streamIndex: 4,
    });

    persistence.onSessionChange({
      sessionId: "ses_saved",
      continuationToken: "ctok_saved",
      streamIndex: 9,
    });

    expect(JSON.parse(storage.getItem("eve-session")!)).toEqual({
      sessionId: "ses_saved",
      continuationToken: "ctok_saved",
      streamIndex: 9,
    });
  });

  it("clears storage when session resets without sessionId", () => {
    const storage = createMemoryStorage();
    const persistence = createEveSessionPersistence({ storage });

    persistence.onSessionChange({
      sessionId: "ses_1",
      continuationToken: "ctok_1",
      streamIndex: 2,
    });
    persistence.onSessionChange({ streamIndex: 0 });

    expect(storage.getItem("eve-session")).toBeNull();
  });
});