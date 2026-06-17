import type { SessionState } from "./types.js";

/** Default `localStorage` key — matches Eve frontend docs. */
export const DEFAULT_EVE_SESSION_STORAGE_KEY = "eve-session";

export interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function isSessionState(value: unknown): value is SessionState {
  if (value === null || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (typeof record.streamIndex !== "number" || !Number.isFinite(record.streamIndex)) {
    return false;
  }
  if (record.streamIndex < 0) return false;
  if (record.sessionId !== undefined && typeof record.sessionId !== "string") return false;
  if (record.continuationToken !== undefined && typeof record.continuationToken !== "string") {
    return false;
  }
  return true;
}

export function parseSessionStateJson(raw: string): SessionState | undefined {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isSessionState(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function serializeSessionState(state: SessionState): string {
  return JSON.stringify(state);
}

export function loadSessionState(
  storage: SessionStorageLike,
  key = DEFAULT_EVE_SESSION_STORAGE_KEY,
): SessionState | undefined {
  const raw = storage.getItem(key);
  if (raw === null || raw.length === 0) return undefined;
  return parseSessionStateJson(raw);
}

export function saveSessionState(
  storage: SessionStorageLike,
  state: SessionState,
  key = DEFAULT_EVE_SESSION_STORAGE_KEY,
): void {
  if (state.sessionId === undefined) {
    storage.removeItem(key);
    return;
  }
  storage.setItem(key, serializeSessionState(state));
}

export function clearSessionState(
  storage: SessionStorageLike,
  key = DEFAULT_EVE_SESSION_STORAGE_KEY,
): void {
  storage.removeItem(key);
}