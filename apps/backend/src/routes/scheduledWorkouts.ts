import type { FastifyInstance } from "fastify";
import type {
  CreateScheduledWorkoutRequest,
  ScheduledWorkout,
  UpdateScheduledWorkoutRequest,
} from "@life-kit/shared";
import { db } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";

interface ScheduledWorkoutRow {
  id: number;
  plan_id: number | null;
  scheduled_date: string;
  status: ScheduledWorkout["status"];
  notes: string | null;
  created_at: string;
}

const rowToScheduledWorkout = (row: ScheduledWorkoutRow): ScheduledWorkout => ({
  id: row.id,
  planId: row.plan_id,
  scheduledDate: row.scheduled_date,
  status: row.status,
  notes: row.notes,
  createdAt: row.created_at,
});

export function registerScheduledWorkoutRoutes(root: FastifyInstance): void {
  root.register(async (app) => {
  app.addHook("preHandler", requireAuth);

  app.get<{ Querystring: { from?: string; to?: string } }>(
    "/api/scheduled-workouts",
    async (request) => {
      const { from, to } = request.query;
      const rows = db
        .prepare<[string, string], ScheduledWorkoutRow>(
          `SELECT * FROM scheduled_workouts
           WHERE scheduled_date >= ? AND scheduled_date <= ?
           ORDER BY scheduled_date ASC`
        )
        .all(from ?? "0000-01-01", to ?? "9999-12-31");
      return rows.map(rowToScheduledWorkout);
    }
  );

  app.post<{ Body: CreateScheduledWorkoutRequest }>(
    "/api/scheduled-workouts",
    async (request, reply) => {
      const { planId, scheduledDate, notes } = request.body;
      if (!scheduledDate) {
        return reply.code(400).send({ error: "scheduledDate is required" });
      }
      const result = db
        .prepare(
          `INSERT INTO scheduled_workouts (plan_id, scheduled_date, notes)
           VALUES (?, ?, ?)`
        )
        .run(planId ?? null, scheduledDate, notes ?? null);
      const row = db
        .prepare<[number], ScheduledWorkoutRow>(
          "SELECT * FROM scheduled_workouts WHERE id = ?"
        )
        .get(Number(result.lastInsertRowid))!;
      return reply.code(201).send(rowToScheduledWorkout(row));
    }
  );

  app.patch<{ Params: { id: string }; Body: UpdateScheduledWorkoutRequest }>(
    "/api/scheduled-workouts/:id",
    async (request, reply) => {
      const existing = db
        .prepare<[string], ScheduledWorkoutRow>(
          "SELECT * FROM scheduled_workouts WHERE id = ?"
        )
        .get(request.params.id);
      if (!existing) return reply.code(404).send({ error: "Not found" });

      const { scheduledDate, status, notes } = request.body;
      db.prepare(
        `UPDATE scheduled_workouts SET scheduled_date = ?, status = ?, notes = ? WHERE id = ?`
      ).run(
        scheduledDate ?? existing.scheduled_date,
        status ?? existing.status,
        notes !== undefined ? notes : existing.notes,
        request.params.id
      );
      const row = db
        .prepare<[string], ScheduledWorkoutRow>(
          "SELECT * FROM scheduled_workouts WHERE id = ?"
        )
        .get(request.params.id)!;
      return rowToScheduledWorkout(row);
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/api/scheduled-workouts/:id",
    async (request, reply) => {
      db.prepare("DELETE FROM scheduled_workouts WHERE id = ?").run(
        request.params.id
      );
      return reply.code(204).send();
    }
  );
  });
}
