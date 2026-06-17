import type { JournalPersistenceAdapter, PersistedSessionRecord } from "./journal-persistence.js";

export interface DurableObjectJournalStub {
  fetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
}

/** Worker-side journal adapter that RPCs a Durable Object journal service. */
export function createDurableObjectJournalRpcPersistence(
  stub: DurableObjectJournalStub,
  origin = "https://eve-journal.internal",
): JournalPersistenceAdapter {
  return {
    async load(sessionId) {
      const url = new URL("/load", origin);
      url.searchParams.set("sessionId", sessionId);
      const response = await stub.fetch(url.toString());
      if (!response.ok) return undefined;
      const body = (await response.json()) as { record: PersistedSessionRecord | null };
      return body.record ?? undefined;
    },
    async save(record) {
      const response = await stub.fetch(new URL("/save", origin).toString(), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(record),
      });
      if (!response.ok) {
        throw new Error(`DO journal save failed: ${response.status}`);
      }
    },
    async delete(sessionId) {
      const url = new URL("/delete", origin);
      url.searchParams.set("sessionId", sessionId);
      const response = await stub.fetch(url.toString(), { method: "DELETE" });
      if (!response.ok) {
        throw new Error(`DO journal delete failed: ${response.status}`);
      }
    },
  };
}