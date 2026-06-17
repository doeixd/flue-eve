import type { EveEvent } from "@flue-eve/shared";

/** Extracts the most recent finalized structured result from a turn event list. */
export function extractCompletedResult<TOutput>(
  events: readonly EveEvent[],
): TOutput | undefined {
  let result: TOutput | undefined;
  for (const event of events) {
    if (event.type === "result.completed") {
      result = event.data.result as TOutput;
    }
  }
  return result;
}