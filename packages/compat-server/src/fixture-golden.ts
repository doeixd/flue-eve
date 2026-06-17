import { readFile } from "node:fs/promises";

import type { EveEvent } from "@flue-eve/shared";

export async function readGoldenEventTypes(path: string): Promise<readonly string[]> {
  const text = await readFile(path, "utf8");
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => (JSON.parse(line) as { type: string }).type);
}

export function eventTypes(events: readonly EveEvent[]): readonly string[] {
  return events.map((event) => event.type);
}