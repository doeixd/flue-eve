import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import type { FlueEvent } from "@flue-eve/shared";

import { eventTypes, readGoldenEventTypes } from "./fixture-golden.js";
import { createMapContext, mapFlueToEve } from "./mapper.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

const FIXTURE_SCENARIOS: Record<
  string,
  { readonly userMessage: string; readonly isFirstTurn: boolean; readonly parks?: boolean }
> = {
  "hitl-approval-park": { userMessage: "Run bash", isFirstTurn: true },
  "mcp-401-park": { userMessage: "List issues", isFirstTurn: false, parks: true },
  "mock-turn": { userMessage: "Hello", isFirstTurn: true },
  "oauth-park": { userMessage: "Connect linear", isFirstTurn: false, parks: true },
  "output-schema-turn": { userMessage: "Summarize", isFirstTurn: true },
};

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}

describe("fixture contract: flue-events → eve-events", () => {
  it("maps hitl-approval-park.json to input.requested before session.waiting", async () => {
    const raw = await readFile(
      join(root, "fixtures/flue-events/hitl-approval-park.json"),
      "utf8",
    );
    const flueEvents = JSON.parse(raw) as FlueEvent[];

    async function* stream() {
      for (const event of flueEvents) yield event;
    }

    const events = await collect(
      mapFlueToEve(
        stream(),
        createMapContext({
          sessionId: "ses_fixture",
          userMessage: "Run bash",
          isFirstTurn: true,
        }),
      ),
    );

    const types = events.map((event) => event.type);
    const inputIndex = types.indexOf("input.requested");
    const waitingIndex = types.lastIndexOf("session.waiting");

    expect(inputIndex).toBeGreaterThan(-1);
    expect(waitingIndex).toBeGreaterThan(inputIndex);

    const inputRequested = events[inputIndex];
    expect(inputRequested?.data.requests).toEqual([
      expect.objectContaining({
        requestId: "approval_1",
        prompt: "Approve tool call: bash",
      }),
    ]);
  });

  it("maps oauth-park.json to authorization.required without session.waiting", async () => {
    const raw = await readFile(join(root, "fixtures/flue-events/oauth-park.json"), "utf8");
    const flueEvents = JSON.parse(raw) as FlueEvent[];

    async function* stream() {
      for (const event of flueEvents) yield event;
    }

    const events = await collect(
      mapFlueToEve(
        stream(),
        createMapContext({
          sessionId: "ses_fixture",
          userMessage: "Connect linear",
          isFirstTurn: false,
        }),
      ),
    );

    expect(events.some((event) => event.type === "authorization.required")).toBe(true);
    expect(events.some((event) => event.type === "session.waiting")).toBe(false);

    const golden = await readGoldenEventTypes(
      join(root, "fixtures/eve-events/oauth-park.jsonl"),
    );
    expect(eventTypes(events)).toEqual(golden);
  });

  it("maps mock-turn.json to session.waiting on first turn", async () => {
    const raw = await readFile(join(root, "fixtures/flue-events/mock-turn.json"), "utf8");
    const flueEvents = JSON.parse(raw) as FlueEvent[];

    async function* stream() {
      for (const event of flueEvents) yield event;
    }

    const events = await collect(
      mapFlueToEve(
        stream(),
        createMapContext({
          sessionId: "ses_fixture",
          userMessage: "Hello",
          isFirstTurn: true,
        }),
      ),
    );

    const golden = await readGoldenEventTypes(
      join(root, "fixtures/eve-events/mock-turn.jsonl"),
    );
    expect(eventTypes(events)).toEqual(golden);
  });

  it("maps mcp-401-park.json to authorization.required without session.waiting", async () => {
    const raw = await readFile(join(root, "fixtures/flue-events/mcp-401-park.json"), "utf8");
    const flueEvents = JSON.parse(raw) as FlueEvent[];

    async function* stream() {
      for (const event of flueEvents) yield event;
    }

    const events = await collect(
      mapFlueToEve(
        stream(),
        createMapContext({
          sessionId: "ses_fixture",
          userMessage: "List issues",
          isFirstTurn: false,
        }),
      ),
    );

    expect(events.some((event) => event.type === "authorization.required")).toBe(true);
    expect(events.some((event) => event.type === "session.waiting")).toBe(false);

    const golden = await readGoldenEventTypes(
      join(root, "fixtures/eve-events/mcp-401-park.jsonl"),
    );
    expect(eventTypes(events)).toEqual(golden);
  });

  it("maps output-schema-turn.json to result.completed before session.waiting", async () => {
    const raw = await readFile(
      join(root, "fixtures/flue-events/output-schema-turn.json"),
      "utf8",
    );
    const flueEvents = JSON.parse(raw) as FlueEvent[];

    async function* stream() {
      for (const event of flueEvents) yield event;
    }

    const events = await collect(
      mapFlueToEve(
        stream(),
        createMapContext({
          sessionId: "ses_fixture",
          userMessage: "Summarize",
          isFirstTurn: true,
        }),
      ),
    );

    const resultIndex = events.findIndex((event) => event.type === "result.completed");
    const waitingIndex = events.findIndex((event) => event.type === "session.waiting");
    expect(resultIndex).toBeGreaterThan(-1);
    expect(waitingIndex).toBeGreaterThan(resultIndex);

    const golden = await readGoldenEventTypes(
      join(root, "fixtures/eve-events/output-schema-turn.jsonl"),
    );
    expect(eventTypes(events)).toEqual(golden);
  });

  it("discovers paired flue/eve golden fixtures", async () => {
    const flueDir = join(root, "fixtures/flue-events");
    const names = (await readdir(flueDir))
      .filter((name) => name.endsWith(".json"))
      .map((name) => name.replace(/\.json$/, ""));

    for (const name of names) {
      expect(FIXTURE_SCENARIOS[name], `missing scenario for ${name}`).toBeDefined();
      const scenario = FIXTURE_SCENARIOS[name]!;
      const raw = await readFile(join(flueDir, `${name}.json`), "utf8");
      const flueEvents = JSON.parse(raw) as FlueEvent[];

      async function* stream() {
        for (const event of flueEvents) yield event;
      }

      const events = await collect(
        mapFlueToEve(
          stream(),
          createMapContext({
            sessionId: "ses_fixture",
            userMessage: scenario.userMessage,
            isFirstTurn: scenario.isFirstTurn,
          }),
        ),
      );

      if (scenario.parks) {
        expect(events.some((event) => event.type === "session.waiting")).toBe(false);
      }

      const golden = await readGoldenEventTypes(
        join(root, "fixtures/eve-events", `${name}.jsonl`),
      );
      expect(eventTypes(events), name).toEqual(golden);
    }
  });
});