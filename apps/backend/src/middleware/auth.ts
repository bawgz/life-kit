import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";
import { isValidSession } from "../auth/sessions.js";

function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * Accepts either the browser session cookie or the static API bearer token
 * (used by the MCP server and any other programmatic client). Attach as a
 * preHandler on every route under /api except /api/auth/login.
 */
export function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  done: (err?: Error) => void
): void {
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length);
    if (safeEquals(token, config.apiToken)) {
      done();
      return;
    }
  }

  const sessionToken = request.cookies[config.sessionCookieName];
  if (isValidSession(sessionToken)) {
    done();
    return;
  }

  reply.code(401).send({ error: "Unauthorized" });
}
