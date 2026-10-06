import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerPlanRoutes } from "./routes/plans.js";
import { registerScheduledWorkoutRoutes } from "./routes/scheduledWorkouts.js";
import { registerSessionRoutes } from "./routes/sessions.js";

/** Registers every route. Split from buildApp so tests can hook onRoute first. */
export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(cookie);

  registerAuthRoutes(app);
  registerPlanRoutes(app);
  registerScheduledWorkoutRoutes(app);
  registerSessionRoutes(app);

  app.get("/api/health", async () => ({ ok: true }));
}

/** Builds the app without listening, so tests can drive it in-process. */
export async function buildApp(
  opts: FastifyServerOptions = {}
): Promise<FastifyInstance> {
  const app = Fastify(opts);
  await registerRoutes(app);
  return app;
}
