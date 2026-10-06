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

const exerciseTypeSchema = z
  .enum(["weighted", "bodyweight", "timed"])
  .describe(
    "How the exercise is measured. 'weighted': weight × reps. 'bodyweight': reps at bodyweight; weight is optional ADDED load (e.g. 25 for BW+25), leave it null for plain bodyweight — never use 0. 'timed': a hold or timed effort; use targetDurationSeconds / durationSeconds instead of reps, weight optional. Defaults to 'weighted'."
  );

const painFields = {
  painDuring: num.describe("Knee pain 0-10 during the workout (leg days)"),
  painAfter: num.describe("Knee pain 0-10 after the workout (leg days)"),
  painNextMorning: num.describe("Knee pain 0-10 the next morning (leg days)"),
};

const rangeFields = {
  rangeMin: z
    .number()
    .int()
    .positive()
    .nullish()
    .describe("Bottom of the progression range: reps, or seconds for timed. Null = derive it."),
  rangeMax: z
    .number()
    .int()
    .positive()
    .nullish()
    .describe(
      "Top of the progression range. Reps climb to this, then weight goes up and reps reset to rangeMin. For timed, the longest hold to progress to (default 60s)."
    ),
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
        "Create a reusable workout plan with items and per-set targets. Item names are freeform text (e.g. 'Bench Press', 'Morning Run'). Set each item's exerciseType: timed holds use targetDurationSeconds (not reps); bodyweight moves leave targetWeight null.",
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
              exerciseType: exerciseTypeSchema.optional(),
              ...rangeFields,
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
    "delete_plan",
    {
      description:
        "Delete a workout plan template and all its exercises and sets. Past sessions and scheduled workouts that used it are kept but unlinked. Cannot be undone.",
      inputSchema: { planId: z.number() },
    },
    async ({ planId }) => {
      await api.delete(`/api/plans/${planId}`);
      return jsonResult({ ok: true, deletedPlanId: planId });
    }
  );

  server.registerTool(
    "progress_plan",
    {
      description:
        "Recalculate a plan's targets from logged history (this also happens automatically when a session from the plan is finished). Uses double progression: sets that hit their goal get +1 rep; once every set reaches the top of the range, weight goes up (+5 lb, or +10 lb for lower-body lifts at 100 lb+) and reps reset. Holds on leg days with knee pain over 3/10, deloads 10% after two sessions below the range, and leaves targets alone when logged weights look like different equipment. Returns the updated plan plus a note per exercise explaining what changed. Safe to run repeatedly.",
      inputSchema: { planId: z.number() },
    },
    async ({ planId }) => jsonResult(await api.post(`/api/plans/${planId}/progress`))
  );

  server.registerTool(
    "add_plan_item",
    {
      description:
        "Add an exercise to an existing workout plan template, with per-set targets. Omit orderIndex to append at the end. Goal weights round up to the nearest 5 (no half weights).",
      inputSchema: {
        planId: z.number(),
        name: z.string(),
        exerciseType: exerciseTypeSchema.optional(),
        ...rangeFields,
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
        "Update an exercise in a workout plan template: rename it, change its type, notes, or progression range (rangeMin/rangeMax), or reorder it with orderIndex (0-based; use get_plan to see the current order). To move an exercise, swap orderIndex values with its neighbor. Changing exerciseType doesn't convert existing set targets — update those too (e.g. reps → targetDurationSeconds when switching to timed).",
      inputSchema: {
        planId: z.number(),
        planItemId: z.number(),
        name: z.string().optional(),
        exerciseType: exerciseTypeSchema.optional(),
        ...rangeFields,
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
    "delete_plan_item",
    {
      description:
        "Remove an exercise (and all its target sets) from a workout plan template. Returns the updated plan.",
      inputSchema: {
        planId: z.number(),
        planItemId: z.number(),
      },
    },
    async ({ planId, planItemId }) => {
      await api.delete(`/api/plans/${planId}/items/${planItemId}`);
      return jsonResult(await api.get(`/api/plans/${planId}`));
    }
  );

  server.registerTool(
    "add_plan_item_set",
    {
      description:
        "Add a target set to an exercise in a workout plan template. Goal weights round up to the nearest 5 (no half weights).",
      inputSchema: {
        planId: z.number(),
        planItemId: z.number(),
        setNumber: z.number(),
        targetReps: num,
        targetWeight: num.describe("Goal weight in lbs; rounds up to the nearest 5"),
        targetDurationSeconds: num,
        targetDistanceMeters: num,
        targetExtra: extraMetricsSchema,
      },
    },
    async ({ planId, planItemId, ...body }) =>
      jsonResult(
        await api.post(`/api/plans/${planId}/items/${planItemId}/sets`, body)
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
        targetExtra: extraMetricsSchema,
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
    "delete_plan_item_set",
    {
      description:
        "Remove one target set from an exercise in a workout plan template. Returns the updated plan.",
      inputSchema: {
        planId: z.number(),
        planItemId: z.number(),
        planItemSetId: z.number(),
      },
    },
    async ({ planId, planItemId, planItemSetId }) => {
      await api.delete(
        `/api/plans/${planId}/items/${planItemId}/sets/${planItemSetId}`
      );
      return jsonResult(await api.get(`/api/plans/${planId}`));
    }
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
    "update_scheduled_workout",
    {
      description:
        "Reschedule a planned workout to a new date, mark it completed or skipped, or change its notes.",
      inputSchema: {
        scheduledWorkoutId: z.number(),
        scheduledDate: z.string().optional().describe("ISO date, e.g. 2026-09-22"),
        status: z.enum(["planned", "completed", "skipped"]).optional(),
        notes: z.string().nullish(),
      },
    },
    async ({ scheduledWorkoutId, ...body }) =>
      jsonResult(
        await api.patch(`/api/scheduled-workouts/${scheduledWorkoutId}`, body)
      )
  );

  server.registerTool(
    "delete_scheduled_workout",
    {
      description:
        "Remove a workout from the calendar. Sessions already started from it are kept but unlinked.",
      inputSchema: { scheduledWorkoutId: z.number() },
    },
    async ({ scheduledWorkoutId }) => {
      await api.delete(`/api/scheduled-workouts/${scheduledWorkoutId}`);
      return jsonResult({ ok: true, deletedScheduledWorkoutId: scheduledWorkoutId });
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
        "Update a session's notes, knee-pain scores, or completion time. Pain can be recorded during the workout or added later (e.g. next-morning score). Setting completedAt on an unfinished session finishes it, which recalculates its plan's targets from what was logged (see progress_plan).",
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
        exerciseType: exerciseTypeSchema.optional(),
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
      description:
        "Log one completed set's actual performance against a session item. Timed exercises log durationSeconds instead of reps; bodyweight exercises leave weight null unless load was added.",
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
    "update_session_set",
    {
      description:
        "Correct a set already in a session (e.g. fix mistyped reps or weight). Use get_session to find the set's id.",
      inputSchema: {
        sessionId: z.number(),
        sessionItemId: z.number(),
        sessionItemSetId: z.number(),
        setNumber: z.number().optional(),
        reps: num,
        weight: num,
        durationSeconds: num,
        distanceMeters: num,
        extra: extraMetricsSchema,
      },
    },
    async ({ sessionId, sessionItemId, sessionItemSetId, ...body }) =>
      jsonResult(
        await api.patch(
          `/api/sessions/${sessionId}/items/${sessionItemId}/sets/${sessionItemSetId}`,
          body
        )
      )
  );

  server.registerTool(
    "delete_session_set",
    {
      description: "Remove one set from a session item. Returns the updated session.",
      inputSchema: {
        sessionId: z.number(),
        sessionItemId: z.number(),
        sessionItemSetId: z.number(),
      },
    },
    async ({ sessionId, sessionItemId, sessionItemSetId }) => {
      await api.delete(
        `/api/sessions/${sessionId}/items/${sessionItemId}/sets/${sessionItemSetId}`
      );
      return jsonResult(await api.get(`/api/sessions/${sessionId}`));
    }
  );

  server.registerTool(
    "delete_session_item",
    {
      description:
        "Remove an exercise (and all its sets) from a session, e.g. one that was skipped. Returns the updated session.",
      inputSchema: {
        sessionId: z.number(),
        sessionItemId: z.number(),
      },
    },
    async ({ sessionId, sessionItemId }) =>
      jsonResult(
        await api.delete(`/api/sessions/${sessionId}/items/${sessionItemId}`)
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
