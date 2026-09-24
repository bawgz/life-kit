import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { api } from "./apiClient.js";

function jsonResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

const extraMetricsSchema = z
  .record(z.union([z.string(), z.number(), z.boolean()]))
  .optional()
  .describe("Any metric that isn't reps/weight/duration/distance, e.g. { rpe: 8 }");

const targetSetInput = z.object({
  setNumber: z.number(),
  targetReps: z.number().nullable().optional(),
  targetWeight: z.number().nullable().optional(),
  targetDurationSeconds: z.number().nullable().optional(),
  targetDistanceMeters: z.number().nullable().optional(),
  targetExtra: extraMetricsSchema,
});

const updateSessionInput = z
  .object({
    notes: z.string().nullable().optional(),
    completedAt: z.string().nullable().optional().describe("ISO datetime"),
    painDuring: z.number().nullable().optional().describe("Knee pain 0-10 during leg workouts"),
    painAfter: z.number().nullable().optional().describe("Knee pain 0-10 after leg workouts"),
    painNextMorning: z.number().nullable().optional().describe("Knee pain 0-10 next morning"),
  })
  .strict();

export function registerTools(server: McpServer): void {
  server.registerTool(
    "list_plans",
    { description: "List all workout plans (e.g. 'Push Day')." },
    async () => jsonResult(await api.get("/api/plans"))
  );

  server.registerTool(
    "get_plan",
    {
      description: "Get a plan's full detail, including its items and target sets.",
      inputSchema: { planId: z.number() },
    },
    async ({ planId }) => jsonResult(await api.get(`/api/plans/${planId}`))
  );

  server.registerTool(
    "create_plan",
    {
      description:
        "Create a workout plan. Target fields are optional — omit them for a " +
        "simple freeform plan. Use kind 'legs' for leg days (enables knee-pain tracking).",
      inputSchema: {
        name: z.string(),
        description: z.string().optional(),
        kind: z.string().nullable().optional(),
        items: z
          .array(
            z.object({
              name: z.string(),
              orderIndex: z.number(),
              notes: z.string().nullable().optional(),
              sets: z.array(targetSetInput),
            })
          )
          .optional(),
      },
    },
    async (input) => jsonResult(await api.post("/api/plans", input))
  );

  server.registerTool(
    "update_plan",
    {
      description: "Update a plan's name, description, or kind (e.g. set kind to 'legs').",
      inputSchema: {
        planId: z.number(),
        name: z.string().optional(),
        description: z.string().nullable().optional(),
        kind: z.string().nullable().optional(),
      },
    },
    async ({ planId, ...rest }) =>
      jsonResult(await api.patch(`/api/plans/${planId}`, rest))
  );

  server.registerTool(
    "list_scheduled_workouts",
    {
      description: "List scheduled workouts between ISO dates.",
      inputSchema: {
        from: z.string().optional(),
        to: z.string().optional(),
      },
    },
    async ({ from, to }) =>
      jsonResult(await api.get("/api/scheduled-workouts", { from, to }))
  );

  server.registerTool(
    "schedule_workout",
    {
      description: "Schedule a workout for a date.",
      inputSchema: {
        planId: z.number().nullable().optional(),
        scheduledDate: z.string().describe("ISO date, e.g. 2026-09-22"),
        notes: z.string().optional(),
      },
    },
    async (input) => jsonResult(await api.post("/api/scheduled-workouts", input))
  );

  server.registerTool(
    "start_session",
    {
      description:
        "Start a workout session. Pass planId to pre-fill exercises and target " +
        "sets from a plan (targets are placeholders you can override); " +
        "omit planId for an ad-hoc session you fill in yourself. Optional " +
        "knee-pain scores (0-10) for leg workouts. Returns the full session detail.",
      inputSchema: {
        date: z.string().describe("ISO date, e.g. 2026-09-22"),
        planId: z.number().nullable().optional(),
        scheduledWorkoutId: z.number().nullable().optional(),
        notes: z.string().nullable().optional(),
        painDuring: z.number().nullable().optional(),
        painAfter: z.number().nullable().optional(),
        painNextMorning: z.number().nullable().optional(),
      },
    },
    async (input) => jsonResult(await api.post("/api/sessions", input))
  );

  server.registerTool(
    "update_session",
    {
      description:
        "Update a session: notes, completion timestamp, or knee-pain scores " +
        "(0-10). Use this to record next-morning knee pain after a leg day.",
      inputSchema: { sessionId: z.number(), ...updateSessionInput.shape },
    },
    async ({ sessionId, ...rest }) =>
      jsonResult(await api.patch(`/api/sessions/${sessionId}`, rest))
  );

  server.registerTool(
    "delete_session",
    {
      description: "Delete a session and all of its sets. Cannot be undone.",
      inputSchema: { sessionId: z.number() },
    },
    async ({ sessionId }) => jsonResult(await api.delete(`/api/sessions/${sessionId}`))
  );

  server.registerTool(
    "log_sets",
    {
      description:
        "Log actual set results for a session item. If the session was started " +
        "from a plan, each call fills in one of the pre-created placeholder " +
        "sets — call once per performed set (omit target fields; the targets " +
        "are already on the placeholder). For ad-hoc exercises, each call " +
        "adds a new set. Bodyweight: pass reps with weight 0 or null.",
      inputSchema: {
        sessionId: z.number(),
        sessionItemId: z.number(),
        sets: z.array(
          z.object({
            setNumber: z.number(),
            reps: z.number().nullable().optional(),
            weight: z.number().nullable().optional(),
            durationSeconds: z.number().nullable().optional(),
            distanceMeters: z.number().nullable().optional(),
            extra: extraMetricsSchema,
          })
        ),
      },
    },
    async ({ sessionId, sessionItemId, sets }) => {
      for (const set of sets) {
        await api.post(`/api/sessions/${sessionId}/items/${sessionItemId}/sets`, set);
      }
      return jsonResult(await api.get(`/api/sessions/${sessionId}`));
    }
  );

  server.registerTool(
    "list_sessions",
    {
      description: "List past sessions between ISO dates.",
      inputSchema: {
        from: z.string().optional(),
        to: z.string().optional(),
      },
    },
    async ({ from, to }) => jsonResult(await api.get("/api/sessions", { from, to }))
  );

  server.registerTool(
    "get_session",
    {
      description: "Get a session's full detail with exercises, sets, and knee-pain scores.",
      inputSchema: { sessionId: z.number() },
    },
    async ({ sessionId }) => jsonResult(await api.get(`/api/sessions/${sessionId}`))
  );
}
