export function parseStartIndex(
  searchParams: URLSearchParams,
): number | { error: string } | undefined {
  const raw = searchParams.get("startIndex");
  if (raw === null || raw === "") return undefined;

  if (!/^\d+$/.test(raw)) {
    return { error: "startIndex must be a non-negative integer." };
  }

  const value = Number.parseInt(raw, 10);
  if (value < 0) {
    return { error: "startIndex must be a non-negative integer." };
  }

  return value;
}