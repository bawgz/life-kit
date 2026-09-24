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
        "Create a reusable workout plan with items and per-set targets. Item names are freeform text (e.g. 'Bench Press', 'Morning Run').",
      inputSchema: {
        name: z.string(),
        description: z.string().optional(),
        items: z
          .array(
            z.object({
              name: z.string(),
              orderIndex: z.number(),
              notes: z.string().optional(),
              sets: z.array(
                z.object({
                  setNumber: z.number(),
                  targetReps: z.number().optional(),
                  targetWeight: z.number().optional(),
                  targetDurationSeconds: z.number().optional(),
                  targetDistanceMeters: z.number().optional(),
                  targetExtra: extraMetricsSchema,
                })
              ),
            })
          )
          .optional(),
      },
    },
    async (args) => jsonResult(await api.post("/api/plans", args))
  );

  server.registerTool(
    "schedule_workout",
    {
      description:
        "Place a plan on the calendar for a specific date (or schedule an ad-hoc day with no plan).",
      inputSchema: {
        planId: z.number().optional(),
        scheduledDate: z.string().describe("ISO date, e.g. 2026-09-22"),
        notes: z.string().optional(),
      },
    },
    async (args) => jsonResult(await api.post("/api/scheduled-workouts", args))
  );

  server.registerTool(
    "list_scheduled_workouts",
    {
      description: "List planned workouts in a date range, e.g. 'what's planned this week'.",
      inputSchema: {
        from: z.string().optional().describe("ISO date, inclusive"),
        to: z.string().optional().describe("ISO date, inclusive"),
      },
    },
    async ({ from, to }) => {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const qs = params.toString();
      return jsonResult(
        await api.get(`/api/scheduled-workouts${qs ? `?${qs}` : ""}`)
      );
    }
  );

  server.registerTool(
    "start_session",
    {
      description:
        "Start (or record) a workout session, optionally following a scheduled workout or plan. If a plan applies, its items are pre-populated.",
      inputSchema: {
        scheduledWorkoutId: z.number().optional(),
        planId: z.number().optional(),
        date: z.string().describe("ISO date"),
        notes: z.string().optional(),
      },
    },
    async (args) => jsonResult(await api.post("/api/sessions", args))
  );

  server.registerTool(
    "add_session_item",
    {
      description:
        "Add an item to an in-progress or ad-hoc session that wasn't already populated from a plan.",
      inputSchema: {
        sessionId: z.number(),
        name: z.string(),
        orderIndex: z.number(),
        notes: z.string().optional(),
      },
    },
    async ({ sessionId, ...body }) =>
      jsonResult(await api.post(`/api/sessions/${sessionId}/items`, body))
  );

  server.registerTool(
    "log_set",
    {
      description: "Log one completed set's actual performance against a session item.",
      inputSchema: {
        sessionId: z.number(),
        sessionItemId: z.number(),
        setNumber: z.number(),
        reps: z.number().optional(),
        weight: z.number().optional(),
        durationSeconds: z.number().optional(),
        distanceMeters: z.number().optional(),
        extra: extraMetricsSchema,
      },
    },
    async ({ sessionId, sessionItemId, ...body }) =>
      jsonResult(
        await api.post(
          `/api/sessions/${sessionId}/items/${sessionItemId}/sets`,
          body
        )
      )
  );

  server.registerTool(
    "get_session",
    {
      description: "Get a session's full detail, including every item and logged set.",
      inputSchema: { sessionId: z.number() },
    },
    async ({ sessionId }) => jsonResult(await api.get(`/api/sessions/${sessionId}`))
  );

  server.registerTool(
    "list_sessions",
    {
      description: "List past workout sessions (history), optionally filtered by date range.",
      inputSchema: {
        from: z.string().optional(),
        to: z.string().optional(),
      },
    },
    async ({ from, to }) => {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const qs = params.toString();
      return jsonResult(await api.get(`/api/sessions${qs ? `?${qs}` : ""}`));
    }
  );
}
