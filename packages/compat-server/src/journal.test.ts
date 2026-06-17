import { describe, expect, it } from "vitest";

import { createSessionWaitingEvent } from "@flue-eve/shared";

import { EventJournal } from "./journal.js";

describe("EventJournal", () => {
  it("appends monotonic indices", () => {
    const journal = new EventJournal();
    expect(journal.append(createSessionWaitingEvent())).toBe(0);
    expect(journal.append(createSessionWaitingEvent())).toBe(1);
    expect(journal.nextIndex).toBe(2);
  });

  it("truncates oldest events and advances baseIndex", () => {
    const journal = new EventJournal({ maxEvents: 2 });
    journal.append(createSessionWaitingEvent());
    journal.append(createSessionWaitingEvent());
    journal.append(createSessionWaitingEvent());

    expect(journal.baseIndex).toBe(1);
    expect(journal.nextIndex).toBe(3);
    expect(journal.snapshot(0).events).toHaveLength(2);
    expect(journal.snapshot(2).events).toHaveLength(1);
  });

  it("snapshots from a non-zero offset", () => {
    const journal = new EventJournal();
    journal.append(createSessionWaitingEvent());
    journal.append(createSessionWaitingEvent());
    journal.append(createSessionWaitingEvent());

    const snap = journal.snapshot(2);
    expect(snap.events).toHaveLength(1);
    expect(snap.baseIndex).toBe(0);
    expect(snap.nextIndex).toBe(3);
  });

  it("notifies subscribers on append and supports unsubscribe", () => {
    const journal = new EventJournal();
    const seen: number[] = [];

    const unsubscribe = journal.subscribe((_event, index) => {
      seen.push(index);
    });

    journal.append(createSessionWaitingEvent());
    journal.append(createSessionWaitingEvent());
    unsubscribe();
    journal.append(createSessionWaitingEvent());

    expect(seen).toEqual([0, 1]);
  });

  it("replaces internal state for hydration", () => {
    const journal = new EventJournal();
    journal.append(createSessionWaitingEvent());
    journal.replaceState({ events: [], baseIndex: 5, nextIndex: 5 });

    expect(journal.baseIndex).toBe(5);
    expect(journal.nextIndex).toBe(5);
    expect(journal.snapshot(0).events).toEqual([]);
  });

  it("notifies multiple subscribers for the same append", () => {
    const journal = new EventJournal();
    let countA = 0;
    let countB = 0;

    journal.subscribe(() => {
      countA += 1;
    });
    journal.subscribe(() => {
      countB += 1;
    });

    journal.append(createSessionWaitingEvent());
    expect(countA).toBe(1);
    expect(countB).toBe(1);
  });
});