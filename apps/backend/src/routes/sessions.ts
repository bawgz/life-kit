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
  date: string;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
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
}
interface PlanItemRow {
  id: number;
  plan_id: number;
  name: string;
  order_index: number;
  notes: string | null;
}

const rowToSession = (row: SessionRow): Session => ({
  id: row.id,
  scheduledWorkoutId: row.scheduled_workout_id,
  date: row.date,
  startedAt: row.started_at,
  completedAt: row.completed_at,
  notes: row.notes,
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
});

function loadSessionDetail(sessionId: number): SessionDetail | null {
  const sessionRow = db
    .prepare<[number], SessionRow>("SELECT * FROM sessions WHERE id = ?")
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
          `SELECT * FROM sessions WHERE date >= ? AND date <= ? ORDER BY date DESC`
        )
        .all(from ?? "0000-01-01", to ?? "9999-12-31");
      return rows.map(rowToSession);
    }
  );

  app.post<{ Body: CreateSessionRequest }>(
    "/api/sessions",
    async (request, reply) => {
      const { scheduledWorkoutId, planId, date, notes } = request.body;
      if (!date) return reply.code(400).send({ error: "date is required" });

      const sessionId = db.transaction(() => {
        const result = db
          .prepare(
            `INSERT INTO sessions (scheduled_workout_id, date, started_at, notes)
             VALUES (?, ?, ?, ?)`
          )
          .run(
            scheduledWorkoutId ?? null,
            date,
            new Date().toISOString(),
            notes ?? null
          );
        const id = Number(result.lastInsertRowid);

        let effectivePlanId = planId ?? null;
        if (!effectivePlanId && scheduledWorkoutId) {
          const scheduled = db
            .prepare<[number], { plan_id: number | null }>(
              "SELECT plan_id FROM scheduled_workouts WHERE id = ?"
            )
            .get(scheduledWorkoutId);
          effectivePlanId = scheduled?.plan_id ?? null;
        }

        if (effectivePlanId) {
          const planItems = db
            .prepare<[number], PlanItemRow>(
              "SELECT * FROM plan_items WHERE plan_id = ? ORDER BY order_index"
            )
            .all(effectivePlanId);
          const insertItem = db.prepare(
            `INSERT INTO session_items (session_id, name, order_index, notes)
             VALUES (?, ?, ?, ?)`
          );
          for (const planItem of planItems) {
            insertItem.run(id, planItem.name, planItem.order_index, planItem.notes);
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

      const { notes, completedAt } = request.body;
      db.prepare("UPDATE sessions SET notes = ?, completed_at = ? WHERE id = ?").run(
        notes !== undefined ? notes : existing.notes,
        completedAt !== undefined ? completedAt : existing.completed_at,
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
      .prepare<[string], { id: number }>(
        "SELECT id FROM session_items WHERE id = ?"
      )
      .get(itemId);
    if (!item) return reply.code(404).send({ error: "Session item not found" });

    const { setNumber, reps, weight, durationSeconds, distanceMeters, extra } =
      request.body;
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
      new Date().toISOString()
    );
    return reply.code(201).send(loadSessionDetail(Number(id)));
  });

  app.patch<{
    Params: { id: string; itemId: string; setId: string };
    Body: UpdateSessionItemSetRequest;
  }>("/api/sessions/:id/items/:itemId/sets/:setId", async (request, reply) => {
    const { id, setId } = request.params;
    const existing = db
      .prepare<[string], SessionItemSetRow>(
        "SELECT * FROM session_item_sets WHERE id = ?"
      )
      .get(setId);
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
      db.prepare("DELETE FROM session_item_sets WHERE id = ?").run(
        request.params.setId
      );
      return reply.code(204).send();
    }
  );
  });
}
