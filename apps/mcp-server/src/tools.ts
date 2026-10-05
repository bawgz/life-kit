import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PlanDetail } from "@life-kit/shared";
import { api } from "./apiClient.js";

function jsonResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

const extraMetricsSchema = z
  .record(z.union([z.string(), z.number(), z.boolean()]))
  .nullish()
  .describe("Any metric that isn't reps/weight/duration/distance, e.g. { rpe: 8 }");

/** Accepts a number, null, or omitted — callers shouldn't have to know which. */
const num = z.number().nullish();

const painFields = {
  painDuring: num.describe("Knee pain 0-10 during the workout (leg days)"),
  painAfter: num.describe("Knee pain 0-10 after the workout (leg days)"),
  painNextMorning: num.describe("Knee pain 0-10 the next morning (leg days)"),
};

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
        kind: z
          .string()
          .nullish()
          .describe("Workout family: 'upper' or 'legs'. Legs enables knee-pain tracking."),
        items: z
          .array(
            z.object({
              name: z.string(),
              orderIndex: z.number(),
              notes: z.string().optional(),
              sets: z.array(
                z.object({
                  setNumber: z.number(),
                  targetReps: num,
                  targetWeight: num,
                  targetDurationSeconds: num,
                  targetDistanceMeters: num,
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
    "update_plan",
    {
      description:
        "Update a workout plan's name, description, or kind ('upper' or 'legs').",
      inputSchema: {
        planId: z.number(),
        name: z.string().optional(),
        description: z.string().nullish(),
        kind: z.string().nullish(),
      },
    },
    async ({ planId, ...body }) =>
      jsonResult(await api.patch(`/api/plans/${planId}`, body))
  );

  server.registerTool(
    "add_plan_item",
    {
      description:
        "Add an exercise to an existing workout plan template, with per-set targets. Omit orderIndex to append at the end. Goal weights round up to the nearest 5 (no half weights).",
      inputSchema: {
        planId: z.number(),
        name: z.string(),
        orderIndex: z
          .number()
          .optional()
          .describe("0-based position in the plan; defaults to the end"),
        notes: z.string().optional(),
        sets: z.array(
          z.object({
            setNumber: z.number(),
            targetReps: num,
            targetWeight: num.describe("Goal weight in lbs; rounds up to the nearest 5"),
            targetDurationSeconds: num,
            targetDistanceMeters: num,
            targetExtra: extraMetricsSchema,
          })
        ),
      },
    },
    async ({ planId, orderIndex, ...body }) => {
      const index =
        orderIndex ??
        (await api.get<PlanDetail>(`/api/plans/${planId}`)).items.length;
      return jsonResult(
        await api.post(`/api/plans/${planId}/items`, { ...body, orderIndex: index })
      );
    }
  );

  server.registerTool(
    "update_plan_item",
    {
      description:
        "Update an exercise in a workout plan template: rename it, change its notes, or reorder it with orderIndex (0-based; use get_plan to see the current order). To move an exercise, swap orderIndex values with its neighbor.",
      inputSchema: {
        planId: z.number(),
        planItemId: z.number(),
        name: z.string().optional(),
        orderIndex: z.number().optional(),
        notes: z.string().nullish(),
      },
    },
    async ({ planId, planItemId, ...body }) =>
      jsonResult(
        await api.patch(`/api/plans/${planId}/items/${planItemId}`, body)
      )
  );

  server.registerTool(
    "update_plan_item_set",
    {
      description:
        "Update one set's goal reps/weight in a workout plan template. Goal weights round up to the nearest 5 (no half weights).",
      inputSchema: {
        planId: z.number(),
        planItemId: z.number(),
        planItemSetId: z.number(),
        setNumber: z.number().optional(),
        targetReps: num,
        targetWeight: num.describe("Goal weight in lbs; rounds up to the nearest 5"),
        targetDurationSeconds: num,
        targetDistanceMeters: num,
      },
    },
    async ({ planId, planItemId, planItemSetId, ...body }) =>
      jsonResult(
        await api.patch(
          `/api/plans/${planId}/items/${planItemId}/sets/${planItemSetId}`,
          body
        )
      )
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
        ...painFields,
      },
    },
    async (args) => jsonResult(await api.post("/api/sessions", args))
  );

  server.registerTool(
    "update_session",
    {
      description:
        "Update a session's notes, knee-pain scores, or completion time. Pain can be recorded during the workout or added later (e.g. next-morning score).",
      inputSchema: {
        sessionId: z.number(),
        notes: z.string().nullish(),
        completedAt: z.string().nullish().describe("ISO datetime"),
        ...painFields,
      },
    },
    async ({ sessionId, ...body }) =>
      jsonResult(await api.patch(`/api/sessions/${sessionId}`, body))
  );

  server.registerTool(
    "delete_session",
    {
      description: "Delete a session and all its items and sets. Cannot be undone.",
      inputSchema: { sessionId: z.number() },
    },
    async ({ sessionId }) => {
      await api.delete(`/api/sessions/${sessionId}`);
      return jsonResult({ ok: true, deletedSessionId: sessionId });
    }
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
        reps: num,
        weight: num,
        durationSeconds: num,
        distanceMeters: num,
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
