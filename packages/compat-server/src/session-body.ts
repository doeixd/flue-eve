export interface InputResponse {
  readonly requestId: string;
  readonly optionId?: string;
  readonly text?: string;
}

export interface ParsedSessionPostBody {
  readonly message?: string;
  readonly continuationToken?: string;
  readonly agent?: string;
  readonly inputResponses?: readonly InputResponse[];
  readonly outputSchema?: Record<string, unknown>;
  readonly clientContext?: string | readonly string[] | Record<string, unknown>;
}

export type SessionBodyParseResult =
  | { readonly ok: true; readonly body: ParsedSessionPostBody }
  | { readonly ok: false; readonly error: string; readonly status: 400 };

export function parseSessionPostBody(payload: unknown): SessionBodyParseResult {
  if (payload === null || typeof payload !== "object") {
    return { ok: false, error: "Expected a JSON object body.", status: 400 };
  }

  const record = payload as Record<string, unknown>;
  const message = parseOptionalNonEmptyString(record.message);
  if (message instanceof ParseError) return message.toResult();

  const continuationToken = parseOptionalNonEmptyString(record.continuationToken);
  if (continuationToken instanceof ParseError) return continuationToken.toResult();

  const agent = parseOptionalNonEmptyString(record.agent);
  if (agent instanceof ParseError) return agent.toResult();

  const inputResponses = parseInputResponses(record.inputResponses);
  if (inputResponses instanceof ParseError) return inputResponses.toResult();

  const outputSchema = parseOptionalObject(record.outputSchema);
  if (outputSchema instanceof ParseError) return outputSchema.toResult();

  const clientContext = parseClientContext(record.clientContext);
  if (clientContext instanceof ParseError) return clientContext.toResult();

  if (message === undefined && inputResponses === undefined) {
    return {
      ok: false,
      error: "Expected a non-empty 'message', a non-empty 'inputResponses' array, or both.",
      status: 400,
    };
  }

  return {
    ok: true,
    body: {
      ...(message !== undefined ? { message } : {}),
      ...(continuationToken !== undefined ? { continuationToken } : {}),
      ...(agent !== undefined ? { agent } : {}),
      ...(inputResponses !== undefined ? { inputResponses } : {}),
      ...(outputSchema !== undefined ? { outputSchema } : {}),
      ...(clientContext !== undefined ? { clientContext } : {}),
    },
  };
}

function parseClientContext(
  value: unknown,
): string | readonly string[] | Record<string, unknown> | undefined | ParseError {
  if (value === undefined) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return new ParseError("Expected 'clientContext' strings to be non-empty.", 400);
    }
    return trimmed;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return new ParseError("Expected 'clientContext' arrays to be non-empty.", 400);
    }
    const strings: string[] = [];
    for (const entry of value) {
      if (typeof entry !== "string") {
        return new ParseError("Expected 'clientContext' array entries to be strings.", 400);
      }
      const trimmed = entry.trim();
      if (trimmed.length === 0) {
        return new ParseError("Expected 'clientContext' array entries to be non-empty.", 400);
      }
      strings.push(trimmed);
    }
    return strings;
  }
  if (value !== null && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return new ParseError(
    "Expected 'clientContext' to be a string, string array, or object.",
    400,
  );
}

function parseOptionalObject(value: unknown): Record<string, unknown> | undefined | ParseError {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return new ParseError("Expected object fields to be plain objects.", 400);
  }
  return value as Record<string, unknown>;
}

function parseOptionalNonEmptyString(value: unknown): string | undefined | ParseError {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    return new ParseError("Expected string fields to be strings.", 400);
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseInputResponses(value: unknown): readonly InputResponse[] | undefined | ParseError {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0) {
    return new ParseError("Expected 'inputResponses' to be a non-empty array.", 400);
  }

  const responses: InputResponse[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== "object") {
      return new ParseError(
        "Expected every 'inputResponses' entry to match the HITL response schema.",
        400,
      );
    }
    const record = entry as Record<string, unknown>;
    const requestId =
      typeof record.requestId === "string" && record.requestId.length > 0
        ? record.requestId
        : undefined;
    if (requestId === undefined) {
      return new ParseError(
        "Expected every 'inputResponses' entry to match the HITL response schema.",
        400,
      );
    }

    const optionId =
      typeof record.optionId === "string" && record.optionId.length > 0
        ? record.optionId
        : undefined;
    const text =
      typeof record.text === "string" && record.text.length > 0 ? record.text : undefined;

    if (optionId === undefined && text === undefined) {
      return new ParseError(
        "Expected every 'inputResponses' entry to match the HITL response schema.",
        400,
      );
    }

    responses.push({
      requestId,
      ...(optionId !== undefined ? { optionId } : {}),
      ...(text !== undefined ? { text } : {}),
    });
  }

  return responses;
}

class ParseError {
  constructor(
    readonly message: string,
    readonly status: 400,
  ) {}

  toResult(): SessionBodyParseResult {
    return { ok: false, error: this.message, status: this.status };
  }
}
