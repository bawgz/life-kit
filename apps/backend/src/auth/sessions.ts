import { randomBytes } from "node:crypto";
import { config } from "../config.js";

interface SessionRecord {
  expiresAt: number;
}

// Single-user app running as one process — an in-memory session store is
// sufficient; sessions are simply lost (requiring re-login) on restart.
const sessions = new Map<string, SessionRecord>();

export function createSession(): string {
  const token = randomBytes(32).toString("hex");
  sessions.set(token, { expiresAt: Date.now() + config.sessionTtlMs });
  return token;
}

export function isValidSession(token: string | undefined): boolean {
  if (!token) return false;
  const record = sessions.get(token);
  if (!record) return false;
  if (record.expiresAt < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

export function destroySession(token: string | undefined): void {
  if (token) sessions.delete(token);
}
