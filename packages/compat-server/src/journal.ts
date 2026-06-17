import type { EveEvent } from "@flue-eve/shared";

export interface JournalOptions {
  readonly maxEvents?: number;
}

export interface JournalSnapshot {
  readonly events: readonly EveEvent[];
  readonly baseIndex: number;
  readonly nextIndex: number;
}

export class EventJournal {
  readonly #maxEvents: number;
  #events: EveEvent[] = [];
  #baseIndex = 0;
  #nextIndex = 0;
  readonly #waiters = new Set<(event: EveEvent, index: number) => void>();

  constructor(options: JournalOptions = {}) {
    this.#maxEvents = options.maxEvents ?? 10_000;
  }

  get nextIndex(): number {
    return this.#nextIndex;
  }

  get baseIndex(): number {
    return this.#baseIndex;
  }

  append(event: EveEvent): number {
    const index = this.#nextIndex;
    this.#events.push(event);
    this.#nextIndex += 1;
    this.#truncateIfNeeded();
    for (const waiter of this.#waiters) {
      waiter(event, index);
    }
    return index;
  }

  snapshot(fromIndex = 0): JournalSnapshot {
    const offset = Math.max(0, fromIndex - this.#baseIndex);
    return {
      events: this.#events.slice(offset),
      baseIndex: this.#baseIndex,
      nextIndex: this.#nextIndex,
    };
  }

  subscribe(listener: (event: EveEvent, index: number) => void): () => void {
    this.#waiters.add(listener);
    return () => this.#waiters.delete(listener);
  }

  replaceState(snapshot: {
    readonly events: readonly EveEvent[];
    readonly baseIndex: number;
    readonly nextIndex: number;
  }): void {
    this.#events = [...snapshot.events];
    this.#baseIndex = snapshot.baseIndex;
    this.#nextIndex = snapshot.nextIndex;
  }

  #truncateIfNeeded(): void {
    while (this.#events.length > this.#maxEvents) {
      this.#events.shift();
      this.#baseIndex += 1;
    }
  }
}