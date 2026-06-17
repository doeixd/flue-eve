import { EVE_SESSION_ID_HEADER } from "@flue-eve/shared";
import { cors } from "hono/cors";

export interface EveCorsOptions {
  /** Allowed browser origin(s) for Mode B split-origin deploys. */
  readonly origin: string | string[];
  readonly allowHeaders?: string[];
}

/**
 * CORS middleware for Production Mode B (split UI + API origins).
 * Exposes Eve stream headers and allows bearer auth on session routes.
 */
export function createEveCorsMiddleware(options: EveCorsOptions) {
  return cors({
    origin: options.origin,
    allowHeaders: [
      "Authorization",
      "Content-Type",
      EVE_SESSION_ID_HEADER,
      ...(options.allowHeaders ?? []),
    ],
    exposeHeaders: [EVE_SESSION_ID_HEADER, "x-eve-stream-version", "x-flue-eve-compat"],
  });
}