import {
  clearSessionState,
  DEFAULT_EVE_SESSION_STORAGE_KEY,
  loadSessionState,
  saveSessionState,
  type SessionState,
  type SessionStorageLike,
} from "@flue-eve/client";

export { DEFAULT_EVE_SESSION_STORAGE_KEY };

export interface EveSessionPersistenceOptions {
  readonly storage: SessionStorageLike;
  readonly key?: string;
}

export interface EveSessionPersistenceCallbacks {
  readonly initialSession: SessionState | undefined;
  readonly onSessionChange: (session: SessionState) => void;
}

/**
 * Browser session cursor persistence for `useEveAgent` (Eve frontend docs pattern).
 *
 * ```tsx
 * const persistence = createEveSessionPersistence({ storage: localStorage });
 * const agent = useEveAgent(persistence);
 * ```
 */
export function createEveSessionPersistence(
  options: EveSessionPersistenceOptions,
): EveSessionPersistenceCallbacks {
  const key = options.key ?? DEFAULT_EVE_SESSION_STORAGE_KEY;
  return {
    initialSession: loadSessionState(options.storage, key),
    onSessionChange(session) {
      if (session.sessionId === undefined) {
        clearSessionState(options.storage, key);
        return;
      }
      saveSessionState(options.storage, session, key);
    },
  };
}