// Adapted from vercel/eve packages/eve/src/client/output-schema.test.ts (Apache-2.0)
import { describe, expect, it } from "vitest";

import {
  createResultCompletedEvent,
  createTurnCompletedEvent,
  type EveEvent,
} from "@flue-eve/shared";

import { extractCompletedResult } from "./output-schema.js";

describe("extractCompletedResult", () => {
  it("extracts the most recent completed structured result", () => {
    const events: EveEvent[] = [
      createResultCompletedEvent({
        result: { title: "First" },
        sequence: 0,
        stepIndex: 0,
        turnId: "turn_0",
      }),
      createTurnCompletedEvent({ sequence: 0, turnId: "turn_0" }),
      createResultCompletedEvent({
        result: { title: "Second" },
        sequence: 1,
        stepIndex: 0,
        turnId: "turn_1",
      }),
    ];

    expect(extractCompletedResult<{ title: string }>(events)).toEqual({ title: "Second" });
  });

  it("returns undefined when no result.completed events are present", () => {
    expect(extractCompletedResult([createTurnCompletedEvent({ sequence: 0, turnId: "turn_0" })])).toBe(
      undefined,
    );
  });
});