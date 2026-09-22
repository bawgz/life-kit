import "dotenv/config";
import cookie from "@fastify/cookie";
import Fastify from "fastify";
import { config } from "./config.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerPlanRoutes } from "./routes/plans.js";
import { registerScheduledWorkoutRoutes } from "./routes/scheduledWorkouts.js";
import { registerSessionRoutes } from "./routes/sessions.js";

const app = Fastify({ logger: true });

await app.register(cookie);

registerAuthRoutes(app);
registerPlanRoutes(app);
registerScheduledWorkoutRoutes(app);
registerSessionRoutes(app);

app.get("/api/health", async () => ({ ok: true }));

app.listen({ port: config.port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
