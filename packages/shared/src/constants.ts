export const COMPAT_API_VERSION = "0.1.0";

export const EVE_ROUTE_PREFIX = "/eve/v1";
export const EVE_HEALTH_ROUTE_PATH = `${EVE_ROUTE_PREFIX}/health`;
export const EVE_INFO_ROUTE_PATH = `${EVE_ROUTE_PREFIX}/info`;
export const EVE_CREATE_SESSION_ROUTE_PATH = `${EVE_ROUTE_PREFIX}/session`;
export const EVE_CONTINUE_SESSION_ROUTE_PATTERN = `${EVE_ROUTE_PREFIX}/session/:sessionId`;
export const EVE_MESSAGE_STREAM_ROUTE_PATTERN = `${EVE_ROUTE_PREFIX}/session/:sessionId/stream`;

export const EVE_SESSION_ID_HEADER = "x-eve-session-id";
export const EVE_STREAM_FORMAT_HEADER = "x-eve-stream-format";
export const EVE_STREAM_VERSION_HEADER = "x-eve-stream-version";
export const EVE_MESSAGE_STREAM_CONTENT_TYPE = "application/x-ndjson; charset=utf-8";
export const EVE_MESSAGE_STREAM_FORMAT = "ndjson";
export const EVE_MESSAGE_STREAM_VERSION = "16";

export const COMPAT_WORKFLOW_ID = "wf_compat";

export function createEveContinueSessionRoutePath(sessionId: string): string {
  return `${EVE_ROUTE_PREFIX}/session/${encodeURIComponent(sessionId)}`;
}

export function createEveMessageStreamRoutePath(sessionId: string): string {
  return `${EVE_ROUTE_PREFIX}/session/${encodeURIComponent(sessionId)}/stream`;
}