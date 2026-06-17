import { createDurableObjectJournalPersistence } from "flue-eve/server/worker";

/**
 * Optional Durable Object journal backend (M7).
 * Mount via wrangler `durable_objects` + route session traffic to this DO when
 * you need strongly consistent journal writes instead of KV eventual consistency.
 */
export class EveSessionJournalDO implements DurableObject {
  readonly #persistence;

  constructor(
    ctx: DurableObjectState,
    _env: unknown,
  ) {
    this.#persistence = createDurableObjectJournalPersistence(ctx.storage);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/load") {
      const sessionId = url.searchParams.get("sessionId");
      if (sessionId === null || sessionId.length === 0) {
        return Response.json({ ok: false, error: "sessionId required" }, { status: 400 });
      }
      const record = await this.#persistence.load(sessionId);
      return Response.json({ ok: true, record: record ?? null });
    }

    if (request.method === "PUT" && url.pathname === "/save") {
      const record = (await request.json()) as Parameters<typeof this.#persistence.save>[0];
      await this.#persistence.save(record);
      return Response.json({ ok: true });
    }

    if (request.method === "DELETE" && url.pathname === "/delete") {
      const sessionId = url.searchParams.get("sessionId");
      if (sessionId === null || sessionId.length === 0) {
        return Response.json({ ok: false, error: "sessionId required" }, { status: 400 });
      }
      await this.#persistence.delete(sessionId);
      return Response.json({ ok: true });
    }

    return Response.json({ ok: false, error: "Not found" }, { status: 404 });
  }
}