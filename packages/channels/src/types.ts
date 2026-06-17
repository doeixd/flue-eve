import type { EveEvent } from "@flue-eve/shared";

export interface ChannelDispatchInput {
  readonly channelName: string;
  readonly sessionId?: string;
  readonly message: string;
  readonly metadata?: Record<string, unknown>;
}

export interface ChannelDispatchResult {
  readonly sessionId: string;
  readonly continuationToken?: string;
}

export interface EveChannelOptions {
  readonly basePath?: string;
  readonly dispatch: (input: ChannelDispatchInput) => Promise<ChannelDispatchResult>;
  readonly readStream: (sessionId: string, options?: { startIndex?: number }) => AsyncIterable<EveEvent>;
}

export interface EveChannelWebhookPayload {
  readonly channel: string;
  readonly sessionId?: string;
  readonly message: string;
  readonly metadata?: Record<string, unknown>;
}
