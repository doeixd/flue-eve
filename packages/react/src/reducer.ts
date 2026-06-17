import type { EveEvent } from "@flue-eve/shared";

import type { InputResponse } from "./message-types.js";

export interface ClientMessageSubmittedEvent {
  readonly type: "client.message.submitted";
  readonly data: {
    readonly createdAt: number;
    readonly message: string;
    readonly submissionId: string;
  };
}

export interface ClientMessageFailedEvent {
  readonly type: "client.message.failed";
  readonly data: {
    readonly createdAt: number;
    readonly error: { readonly message: string };
    readonly message: string;
    readonly submissionId: string;
  };
}

export interface ClientInputRespondedEvent {
  readonly type: "client.input.responded";
  readonly data: {
    readonly createdAt: number;
    readonly responses: readonly InputResponse[];
  };
}

export type EveAgentReducerEvent =
  | ClientInputRespondedEvent
  | ClientMessageFailedEvent
  | ClientMessageSubmittedEvent
  | EveEvent;

export interface EveAgentReducer<TData> {
  initial(): TData;
  reduce(data: TData, event: EveAgentReducerEvent): TData;
}