import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";

import type { ClientAuth, ClientSession, HeadersValue, SendTurnPayload, SessionState } from "@flue-eve/client";
import type { EveEvent } from "@flue-eve/shared";

import { EveAgentStore, type EveAgentStoreCallbacks, type EveAgentStoreSnapshot, type EveAgentStoreStatus, type PrepareSend } from "./eve-agent-store.js";
import { defaultMessageReducer, type EveMessageData } from "./message-reducer.js";
import type { EveAgentReducer } from "./reducer.js";

export type UseEveAgentStatus = EveAgentStoreStatus;
export type UseEveAgentSnapshot<TData> = EveAgentStoreSnapshot<TData>;

export interface UseEveAgentHelpers<TData> extends UseEveAgentSnapshot<TData> {
  readonly reset: () => void;
  readonly send: (input: SendTurnPayload) => Promise<void>;
  readonly stop: () => void;
}

export interface UseEveAgentOptions<TData> extends EveAgentStoreCallbacks<TData> {
  readonly auth?: ClientAuth;
  readonly headers?: HeadersValue;
  readonly host?: string;
  readonly initialEvents?: readonly EveEvent[];
  readonly initialSession?: SessionState;
  readonly maxReconnectAttempts?: number;
  readonly optimistic?: boolean;
  readonly reducer?: EveAgentReducer<TData>;
  readonly session?: ClientSession;
}

export function useEveAgent(
  options?: UseEveAgentOptions<EveMessageData>,
): UseEveAgentHelpers<EveMessageData>;

export function useEveAgent<TData>(
  options: UseEveAgentOptions<TData> & { readonly reducer: EveAgentReducer<TData> },
): UseEveAgentHelpers<TData>;

export function useEveAgent<TData>(options: UseEveAgentOptions<TData> = {}): UseEveAgentHelpers<TData> {
  const storeRef = useRef<EveAgentStore<TData> | undefined>(undefined);

  if (!storeRef.current) {
    const reducer = options.reducer ?? (defaultMessageReducer() as EveAgentReducer<TData>);
    storeRef.current = new EveAgentStore({
      auth: options.auth,
      headers: options.headers,
      host: options.host,
      initialEvents: options.initialEvents,
      initialSession: options.initialSession,
      maxReconnectAttempts: options.maxReconnectAttempts,
      optimistic: options.optimistic,
      reducer,
      session: options.session,
    });
  }

  const store = storeRef.current;
  store.setCallbacks({
    onError: options.onError,
    onEvent: options.onEvent,
    onFinish: options.onFinish,
    onSessionChange: options.onSessionChange,
    prepareSend: options.prepareSend as PrepareSend | undefined,
  });

  const subscribe = useCallback((onStoreChange: () => void) => store.subscribe(onStoreChange), [store]);
  const snapshot = useSyncExternalStore(subscribe, () => store.snapshot, () => store.snapshot);

  const reset = useCallback(() => store.reset(), [store]);
  const send = useCallback((input: SendTurnPayload) => store.send(input), [store]);
  const stop = useCallback(() => store.stop(), [store]);

  useEffect(() => {
    return () => {
      store.stop();
    };
  }, [store]);

  return useMemo(
    () => ({ ...snapshot, reset, send, stop }),
    [reset, send, snapshot, stop],
  );
}