// Guards against the MCP drifting from the backend: every backend route must
// be reachable through some tool, and every tool must be accounted for here.
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import Fastify from "fastify";
import { client, mcpUrl, teardown } from "./helpers.js";

after(teardown);

/** Which backend route(s) each MCP tool calls. Update when adding either. */
const TOOL_ROUTES: Record<string, string[]> = {
  list_plans: ["GET /api/plans"],
  get_plan: ["GET /api/plans/:id"],
  create_plan: ["POST /api/plans"],
  update_plan: ["PATCH /api/plans/:id"],
  delete_plan: ["DELETE /api/plans/:id"],
  progress_plan: ["POST /api/plans/:id/progress"],
  add_plan_item: ["POST /api/plans/:id/items"],
  update_plan_item: ["PATCH /api/plans/:id/items/:itemId"],
  delete_plan_item: ["DELETE /api/plans/:id/items/:itemId"],
  add_plan_item_set: ["POST /api/plans/:id/items/:itemId/sets"],
  update_plan_item_set: ["PATCH /api/plans/:id/items/:itemId/sets/:setId"],
  delete_plan_item_set: ["DELETE /api/plans/:id/items/:itemId/sets/:setId"],
  schedule_workout: ["POST /api/scheduled-workouts"],
  list_scheduled_workouts: ["GET /api/scheduled-workouts"],
  update_scheduled_workout: ["PATCH /api/scheduled-workouts/:id"],
  delete_scheduled_workout: ["DELETE /api/scheduled-workouts/:id"],
  start_session: ["POST /api/sessions"],
  get_session: ["GET /api/sessions/:id"],
  list_sessions: ["GET /api/sessions"],
  update_session: ["PATCH /api/sessions/:id"],
  delete_session: ["DELETE /api/sessions/:id"],
  add_session_item: ["POST /api/sessions/:id/items"],
  delete_session_item: ["DELETE /api/sessions/:id/items/:itemId"],
  log_set: ["POST /api/sessions/:id/items/:itemId/sets"],
  update_session_set: ["PATCH /api/sessions/:id/items/:itemId/sets/:setId"],
  delete_session_set: ["DELETE /api/sessions/:id/items/:itemId/sets/:setId"],
};

/** Backend routes deliberately not exposed to agents. */
const NOT_FOR_AGENTS = new Set([
  "GET /api/health",
  "POST /api/auth/login",
  "POST /api/auth/logout",
  "GET /api/auth/me",
]);

async function backendRoutes(): Promise<string[]> {
  const { registerRoutes } = await import("../../backend/src/app.js");
  const app = Fastify();
  const routes: string[] = [];
  app.addHook("onRoute", (r) => {
    for (const method of [r.method].flat()) {
      if (method !== "HEAD") routes.push(`${method} ${r.url}`);
    }
  });
  await registerRoutes(app);
  await app.ready();
  await app.close();
  return routes;
}

describe("MCP ↔ backend coverage", () => {
  it("every backend route is reachable through an MCP tool", async () => {
    const covered = new Set(Object.values(TOOL_ROUTES).flat());
    const missing = (await backendRoutes()).filter(
      (r) => !covered.has(r) && !NOT_FOR_AGENTS.has(r)
    );
    assert.deepEqual(missing, [], "add an MCP tool (and a TOOL_ROUTES entry) for these routes");
  });

  it("every mapped route still exists in the backend", async () => {
    const routes = new Set(await backendRoutes());
    const stale = Object.values(TOOL_ROUTES).flat().filter((r) => !routes.has(r));
    assert.deepEqual(stale, []);
  });

  it("the server exposes exactly the mapped tools", async () => {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), Object.keys(TOOL_ROUTES).sort());
  });
});

describe("MCP HTTP endpoint", () => {
  it("rejects requests without the MCP token", async () => {
    const res = await fetch(mcpUrl, { method: "POST" });
    assert.equal(res.status, 401);
  });

  it("rejects a wrong MCP token", async () => {
    const res = await fetch(mcpUrl, {
      method: "POST",
      headers: { Authorization: "Bearer nope" },
    });
    assert.equal(res.status, 401);
  });

  it("404s other paths", async () => {
    const res = await fetch(mcpUrl.replace("/mcp", "/other"));
    assert.equal(res.status, 404);
  });
});
