import { randomBytes } from "node:crypto";

export function createSessionId(): string {
  const bytes = randomBytes(10);
  const encoded = bytes.toString("base64url");
  return `ses_${encoded}`;
}

export function createContinuationToken(): string {
  return `eve:${randomBytes(32).toString("base64url")}`;
}

export function createTurnId(): string {
  return `turn_${randomBytes(8).toString("base64url")}`;
}