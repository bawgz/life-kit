import type { FastifyInstance } from "fastify";
import type {
  CreateSessionItemRequest,
  CreateSessionItemSetRequest,
  CreateSessionRequest,
  Session,
  SessionDetail,
  SessionItem,
  SessionItemSet,
  UpdateSessionRequest,
  UpdateSessionItemSetRequest,
} from "@life-kit/shared";
import { db, parseJson, toJson } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";

interface SessionRow {
  id: number;
  scheduled_workout_id: number | null;
  plan_id: number | null;
  date: string;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
  pain_during: number | null;
  pain_after: number | null;
  pain_next_morning: number | null;
  /** Joined from plans (via plan_id or scheduled_workout_id); absent on bare SELECT *. */
  plan_name?: string | null;
  plan_kind?: string | null;
}
interface SessionItemRow {
  id: number;
  session_id: number;
  name: string;
  order_index: number;
  notes: string | null;
}
interface SessionItemSetRow {
  id: number;
  session_item_id: number;
  set_number: number;
  reps: number | null;
  weight: number | null;
  duration_seconds: number | null;
  distance_meters: number | null;
  extra: string | null;
  completed_at: string | null;
  target_reps: number | null;
  target_weight: number | null;
  target_duration_seconds: number | null;
  target_distance_meters: number | null;
}
interface PlanItemRow {
  id: number;
  plan_id: number;
  name: string;
  order_index: number;
  notes: string | null;
}
interface PlanItemSetRow {
  id: number;
  plan_item_id: number;
  set_number: number;
  target_reps: number | null;
  target_weight: number | null;
  target_duration_seconds: number | null;
  target_distance_meters: number | null;
}

const rowToSession = (row: SessionRow): Session => ({
  id: row.id,
  scheduledWorkoutId: row.scheduled_workout_id,
  planId: row.plan_id,
  planName: row.plan_name ?? null,
  planKind: row.plan_kind ?? null,
  date: row.date,
  startedAt: row.started_at,
  completedAt: row.completed_at,
  notes: row.notes,
  painDuring: row.pain_during,
  painAfter: row.pain_after,
  painNextMorning: row.pain_next_morning,
});

const rowToSessionItem = (row: SessionItemRow): SessionItem => ({
  id: row.id,
  sessionId: row.session_id,
  name: row.name,
  orderIndex: row.order_index,
  notes: row.notes,
});

const rowToSessionItemSet = (row: SessionItemSetRow): SessionItemSet => ({
  id: row.id,
  sessionItemId: row.session_item_id,
  setNumber: row.set_number,
  reps: row.reps,
  weight: row.weight,
  durationSeconds: row.duration_seconds,
  distanceMeters: row.distance_meters,
  extra: parseJson(row.extra),
  completedAt: row.completed_at,
  targetReps: row.target_reps,
  targetWeight: row.target_weight,
  targetDurationSeconds: row.target_duration_seconds,
  targetDistanceMeters: row.target_distance_meters,
});

/** Base SELECT for sessions with the plan name/kind joined in. */
const SESSION_WITH_PLAN = `
  SELECT s.*,
         COALESCE(p1.name, p2.name) AS plan_name,
         COALESCE(p1.kind, p2.kind) AS plan_kind
  FROM sessions s
  LEFT JOIN plans p1 ON p1.id = s.plan_id
  LEFT JOIN scheduled_workouts sw ON sw.id = s.scheduled_workout_id
  LEFT JOIN plans p2 ON p2.id = sw.plan_id
`;

function loadSessionDetail(sessionId: number): SessionDetail | null {
  const sessionRow = db
    .prepare<[number], SessionRow>(`${SESSION_WITH_PLAN} WHERE s.id = ?`)
    .get(sessionId);
  if (!sessionRow) return null;

  const itemRows = db
    .prepare<[number], SessionItemRow>(
      "SELECT * FROM session_items WHERE session_id = ? ORDER BY order_index"
    )
    .all(sessionId);

  const items = itemRows.map((itemRow) => {
    const setRows = db
      .prepare<[number], SessionItemSetRow>(
        "SELECT * FROM session_item_sets WHERE session_item_id = ? ORDER BY set_number"
      )
      .all(itemRow.id);
    return {
      ...rowToSessionItem(itemRow),
      sets: setRows.map(rowToSessionItemSet),
    };
  });

  return { ...rowToSession(sessionRow), items };
}

export function registerSessionRoutes(root: FastifyInstance): void {
  root.register(async (app) => {
  app.addHook("preHandler", requireAuth);

  app.get<{ Querystring: { from?: string; to?: string } }>(
    "/api/sessions",
    async (request) => {
      const { from, to } = request.query;
      const rows = db
        .prepare<[string, string], SessionRow>(
          `${SESSION_WITH_PLAN} WHERE s.date >= ? AND s.date <= ? ORDER BY s.date DESC`
        )
        .all(from ?? "0000-01-01", to ?? "9999-12-31");
      return rows.map(rowToSession);
    }
  );

  app.post<{ Body: CreateSessionRequest }>(
    "/api/sessions",
    async (request, reply) => {
      const {
        scheduledWorkoutId,
        planId,
        date,
        notes,
        painDuring,
        painAfter,
        painNextMorning,
      } = request.body;
      if (!date) return reply.code(400).send({ error: "date is required" });

      const sessionId = db.transaction(() => {
        let effectivePlanId = planId ?? null;
        if (!effectivePlanId && scheduledWorkoutId) {
          const scheduled = db
            .prepare<[number], { plan_id: number | null }>(
              "SELECT plan_id FROM scheduled_workouts WHERE id = ?"
            )
            .get(scheduledWorkoutId);
          effectivePlanId = scheduled?.plan_id ?? null;
        }

        const result = db
          .prepare(
            `INSERT INTO sessions
               (scheduled_workout_id, plan_id, date, started_at, notes,
                pain_during, pain_after, pain_next_morning)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            scheduledWorkoutId ?? null,
            effectivePlanId,
            date,
            new Date().toISOString(),
            notes ?? null,
            painDuring ?? null,
            painAfter ?? null,
            painNextMorning ?? null
          );
        const id = Number(result.lastInsertRowid);

        if (effectivePlanId) {
          // Pre-populate items AND their target sets from the plan. Target
          // sets are placeholder rows (no actuals, no completed_at) that the
          // client fills in as the workout progresses.
          const planItems = db
            .prepare<[number], PlanItemRow>(
              "SELECT * FROM plan_items WHERE plan_id = ? ORDER BY order_index"
            )
            .all(effectivePlanId);
          const planSetsStmt = db.prepare<[number], PlanItemSetRow>(
            "SELECT * FROM plan_item_sets WHERE plan_item_id = ? ORDER BY set_number"
          );
          const insertItem = db.prepare(
            `INSERT INTO session_items (session_id, name, order_index, notes)
             VALUES (?, ?, ?, ?)`
          );
          const insertSet = db.prepare(
            `INSERT INTO session_item_sets
               (session_item_id, set_number, target_reps, target_weight,
                target_duration_seconds, target_distance_meters)
             VALUES (?, ?, ?, ?, ?, ?)`
          );
          for (const planItem of planItems) {
            const itemResult = insertItem.run(
              id,
              planItem.name,
              planItem.order_index,
              planItem.notes
            );
            const sessionItemId = Number(itemResult.lastInsertRowid);
            for (const planSet of planSetsStmt.all(planItem.id)) {
              insertSet.run(
                sessionItemId,
                planSet.set_number,
                planSet.target_reps,
                planSet.target_weight,
                planSet.target_duration_seconds,
                planSet.target_distance_meters
              );
            }
          }
        }

        return id;
      })();

      return reply.code(201).send(loadSessionDetail(sessionId));
    }
  );

  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id",
    async (request, reply) => {
      const detail = loadSessionDetail(Number(request.params.id));
      if (!detail) return reply.code(404).send({ error: "Not found" });
      return detail;
    }
  );

  app.patch<{ Params: { id: string }; Body: UpdateSessionRequest }>(
    "/api/sessions/:id",
    async (request, reply) => {
      const id = Number(request.params.id);
      const existing = db
        .prepare<[number], SessionRow>("SELECT * FROM sessions WHERE id = ?")
        .get(id);
      if (!existing) return reply.code(404).send({ error: "Not found" });

      const { notes, completedAt, painDuring, painAfter, painNextMorning } =
        request.body;
      db.prepare(
        `UPDATE sessions
         SET notes = ?, completed_at = ?, pain_during = ?, pain_after = ?,
             pain_next_morning = ?
         WHERE id = ?`
      ).run(
        notes !== undefined ? notes : existing.notes,
        completedAt !== undefined ? completedAt : existing.completed_at,
        painDuring !== undefined ? painDuring : existing.pain_during,
        painAfter !== undefined ? painAfter : existing.pain_after,
        painNextMorning !== undefined ? painNextMorning : existing.pain_next_morning,
        id
      );
      return loadSessionDetail(id);
    }
  );

  app.post<{ Params: { id: string }; Body: CreateSessionItemRequest }>(
    "/api/sessions/:id/items",
    async (request, reply) => {
      const sessionId = Number(request.params.id);
      const session = db
        .prepare<[number], { id: number }>("SELECT id FROM sessions WHERE id = ?")
        .get(sessionId);
      if (!session) return reply.code(404).send({ error: "Session not found" });

      const { name, orderIndex, notes } = request.body;
      db.prepare(
        `INSERT INTO session_items (session_id, name, order_index, notes)
         VALUES (?, ?, ?, ?)`
      ).run(sessionId, name, orderIndex, notes ?? null);
      return reply.code(201).send(loadSessionDetail(sessionId));
    }
  );

  app.post<{
    Params: { id: string; itemId: string };
    Body: CreateSessionItemSetRequest;
  }>("/api/sessions/:id/items/:itemId/sets", async (request, reply) => {
    const { itemId, id } = request.params;
    const item = db
      .prepare<[string, string], { id: number }>(
        "SELECT id FROM session_items WHERE id = ? AND session_id = ?"
      )
      .get(itemId, id);
    if (!item) return reply.code(404).send({ error: "Session item not found" });

    const { setNumber, reps, weight, durationSeconds, distanceMeters, extra } =
      request.body;
    const now = new Date().toISOString();

    // If the session was started from a plan, a placeholder row already exists
    // for this set number (targets copied, no actuals yet) — fill it in
    // instead of inserting a duplicate.
    const placeholder = db
      .prepare<[string, number], SessionItemSetRow>(
        `SELECT * FROM session_item_sets
         WHERE session_item_id = ? AND set_number = ?
           AND reps IS NULL AND weight IS NULL AND duration_seconds IS NULL
           AND distance_meters IS NULL AND completed_at IS NULL`
      )
      .get(itemId, setNumber);

    if (placeholder) {
      db.prepare(
        `UPDATE session_item_sets
         SET reps = ?, weight = ?, duration_seconds = ?, distance_meters = ?,
             extra = ?, completed_at = ?
         WHERE id = ?`
      ).run(
        reps ?? null,
        weight ?? null,
        durationSeconds ?? null,
        distanceMeters ?? null,
        toJson(extra),
        now,
        placeholder.id
      );
    } else {
      db.prepare(
        `INSERT INTO session_item_sets
           (session_item_id, set_number, reps, weight, duration_seconds,
            distance_meters, extra, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        itemId,
        setNumber,
        reps ?? null,
        weight ?? null,
        durationSeconds ?? null,
        distanceMeters ?? null,
        toJson(extra),
        now
      );
    }
    return reply.code(201).send(loadSessionDetail(Number(id)));
  });

  app.patch<{
    Params: { id: string; itemId: string; setId: string };
    Body: UpdateSessionItemSetRequest;
  }>("/api/sessions/:id/items/:itemId/sets/:setId", async (request, reply) => {
    const { id, itemId, setId } = request.params;
    const existing = db
      .prepare<[string, string, string], SessionItemSetRow>(
        `SELECT s.* FROM session_item_sets s
         JOIN session_items i ON i.id = s.session_item_id
         WHERE s.id = ? AND i.id = ? AND i.session_id = ?`
      )
      .get(setId, itemId, id);
    if (!existing) return reply.code(404).send({ error: "Set not found" });

    const { setNumber, reps, weight, durationSeconds, distanceMeters, extra } =
      request.body;
    db.prepare(
      `UPDATE session_item_sets SET
         set_number = ?, reps = ?, weight = ?, duration_seconds = ?,
         distance_meters = ?, extra = ?
       WHERE id = ?`
    ).run(
      setNumber ?? existing.set_number,
      reps !== undefined ? reps : existing.reps,
      weight !== undefined ? weight : existing.weight,
      durationSeconds !== undefined ? durationSeconds : existing.duration_seconds,
      distanceMeters !== undefined ? distanceMeters : existing.distance_meters,
      extra !== undefined ? toJson(extra) : existing.extra,
      setId
    );
    return loadSessionDetail(Number(id));
  });

  app.delete<{ Params: { id: string; itemId: string; setId: string } }>(
    "/api/sessions/:id/items/:itemId/sets/:setId",
    async (request, reply) => {
      const { id, itemId, setId } = request.params;
      const result = db
        .prepare(
          `DELETE FROM session_item_sets
           WHERE id = ? AND session_item_id IN
             (SELECT id FROM session_items WHERE id = ? AND session_id = ?)`
        )
        .run(setId, itemId, id);
      if (result.changes === 0) {
        return reply.code(404).send({ error: "Set not found" });
      }
      return reply.code(204).send();
    }
  );

  app.delete<{ Params: { id: string; itemId: string } }>(
    "/api/sessions/:id/items/:itemId",
    async (request, reply) => {
      const sessionId = Number(request.params.id);
      const item = db
        .prepare<[string], { id: number; session_id: number }>(
          "SELECT id, session_id FROM session_items WHERE id = ?"
        )
        .get(request.params.itemId);
      if (!item || item.session_id !== sessionId) {
        return reply.code(404).send({ error: "Session item not found" });
      }
      db.prepare("DELETE FROM session_items WHERE id = ?").run(request.params.itemId);
      return loadSessionDetail(sessionId);
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/api/sessions/:id",
    async (request, reply) => {
      const result = db
        .prepare("DELETE FROM sessions WHERE id = ?")
        .run(request.params.id);
      if (result.changes === 0) return reply.code(404).send({ error: "Not found" });
      return reply.code(204).send();
    }
  );
  });
}
