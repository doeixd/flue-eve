import type { HandleMessageStreamEvent, MessageResult } from "./types.js";
import { extractCompletedResult } from "./output-schema.js";
import {
  deriveResultStatus,
  extractCompletedMessage,
  extractInputRequests,
} from "./session-utils.js";

interface MessageResponseInput {
  readonly continuationToken?: string;
  readonly createStream: () => AsyncGenerator<HandleMessageStreamEvent>;
  readonly sessionId: string;
}

export class MessageResponse<TOutput = unknown> implements AsyncIterable<HandleMessageStreamEvent> {
  readonly continuationToken: string | undefined;
  readonly sessionId: string;

  #consumed = false;
  readonly #createStream: () => AsyncGenerator<HandleMessageStreamEvent>;

  constructor(input: MessageResponseInput) {
    this.continuationToken = input.continuationToken;
    this.sessionId = input.sessionId;
    this.#createStream = input.createStream;
  }

  async result(): Promise<MessageResult<TOutput>> {
    const events: HandleMessageStreamEvent[] = [];
    for await (const event of this) events.push(event);
    return {
      data: extractCompletedResult<TOutput>(events),
      events,
      inputRequests: extractInputRequests(events),
      message: extractCompletedMessage(events),
      sessionId: this.sessionId,
      status: deriveResultStatus(events),
    };
  }

  [Symbol.asyncIterator](): AsyncIterator<HandleMessageStreamEvent> {
    if (this.#consumed) throw new Error("MessageResponse has already been consumed.");
    this.#consumed = true;
    return this.#createStream();
  }
}