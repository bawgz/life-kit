import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import type { LoginRequest } from "@life-kit/shared";
import { config } from "../config.js";
import { createSession, destroySession, isValidSession } from "../auth/sessions.js";

export function registerAuthRoutes(app: FastifyInstance): void {
  app.post<{ Body: LoginRequest }>("/api/auth/login", async (request, reply) => {
    const { password } = request.body;
    if (!password || !bcrypt.compareSync(password, config.adminPasswordHash)) {
      return reply.code(401).send({ error: "Invalid password" });
    }

    const token = createSession();
    reply.setCookie(config.sessionCookieName, token, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: config.sessionTtlMs / 1000,
    });
    return reply.send({ ok: true });
  });

  app.post("/api/auth/logout", async (request, reply) => {
    destroySession(request.cookies[config.sessionCookieName]);
    reply.clearCookie(config.sessionCookieName, { path: "/" });
    return reply.send({ ok: true });
  });

  // Lets the frontend check session validity on load without touching a
  // real resource. Note: bearer-token clients (the MCP server) don't need
  // this, so it only checks the session cookie, not requireAuth's token path.
  app.get("/api/auth/me", async (request, reply) => {
    if (!isValidSession(request.cookies[config.sessionCookieName])) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    return reply.send({ ok: true });
  });
}
