import type { FastifyInstance } from "fastify";
import type {
  CreatePlanItemInput,
  ExerciseType,
  CreatePlanItemSetInput,
  CreatePlanRequest,
  Plan,
  PlanDetail,
  PlanItem,
  PlanItemSet,
  ProgressResult,
  UpdatePlanItemInput,
  UpdatePlanItemSetInput,
  UpdatePlanRequest,
} from "@life-kit/shared";
import { db, parseJson, toJson } from "../db/index.js";
import { exerciseTypeError, isValidExerciseType } from "../exerciseType.js";
import { applyProgression } from "../progress.js";
import { requireAuth } from "../middleware/auth.js";

interface PlanRow {
  id: number;
  name: string;
  description: string | null;
  kind: string | null;
  created_at: string;
}
interface PlanItemRow {
  id: number;
  plan_id: number;
  name: string;
  exercise_type: ExerciseType;
  order_index: number;
  notes: string | null;
  range_min: number | null;
  range_max: number | null;
  progress_note: string | null;
}
interface PlanItemSetRow {
  id: number;
  plan_item_id: number;
  set_number: number;
  target_reps: number | null;
  target_weight: number | null;
  target_duration_seconds: number | null;
  target_distance_meters: number | null;
  target_extra: string | null;
}

const rowToPlan = (row: PlanRow): Plan => ({
  id: row.id,
  name: row.name,
  description: row.description,
  kind: row.kind,
  createdAt: row.created_at,
});

const rowToPlanItem = (row: PlanItemRow): PlanItem => ({
  id: row.id,
  planId: row.plan_id,
  name: row.name,
  exerciseType: row.exercise_type,
  orderIndex: row.order_index,
  notes: row.notes,
  rangeMin: row.range_min,
  rangeMax: row.range_max,
  progressNote: row.progress_note,
});

const rowToPlanItemSet = (row: PlanItemSetRow): PlanItemSet => ({
  id: row.id,
  planItemId: row.plan_item_id,
  setNumber: row.set_number,
  targetReps: row.target_reps,
  targetWeight: row.target_weight,
  targetDurationSeconds: row.target_duration_seconds,
  targetDistanceMeters: row.target_distance_meters,
  targetExtra: parseJson(row.target_extra),
});

function loadPlanDetail(planId: number): PlanDetail | null {
  const planRow = db
    .prepare<[number], PlanRow>("SELECT * FROM plans WHERE id = ?")
    .get(planId);
  if (!planRow) return null;

  const itemRows = db
    .prepare<[number], PlanItemRow>(
      "SELECT * FROM plan_items WHERE plan_id = ? ORDER BY order_index"
    )
    .all(planId);

  const items = itemRows.map((itemRow) => {
    const setRows = db
      .prepare<[number], PlanItemSetRow>(
        "SELECT * FROM plan_item_sets WHERE plan_item_id = ? ORDER BY set_number"
      )
      .all(itemRow.id);
    return {
      ...rowToPlanItem(itemRow),
      sets: setRows.map(rowToPlanItemSet),
    };
  });

  return { ...rowToPlan(planRow), items };
}

function insertPlanItems(planId: number, items: CreatePlanItemInput[]): void {
  const insertItem = db.prepare(
    `INSERT INTO plan_items (plan_id, name, exercise_type, order_index, notes, range_min, range_max)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const insertSet = db.prepare(
    `INSERT INTO plan_item_sets
       (plan_item_id, set_number, target_reps, target_weight,
        target_duration_seconds, target_distance_meters, target_extra)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  for (const item of items) {
    const itemResult = insertItem.run(
      planId,
      item.name,
      item.exerciseType ?? "weighted",
      item.orderIndex,
      item.notes ?? null,
      item.rangeMin ?? null,
      item.rangeMax ?? null
    );
    const planItemId = Number(itemResult.lastInsertRowid);
    for (const set of item.sets) {
      insertSet.run(
        planItemId,
        set.setNumber,
        set.targetReps ?? null,
        roundUp5(set.targetWeight),
        set.targetDurationSeconds ?? null,
        set.targetDistanceMeters ?? null,
        toJson(set.targetExtra)
      );
    }
  }
}

/** Returns an error message if a range patch is invalid, else null. */
function rangeError(min: unknown, max: unknown): string | null {
  for (const v of [min, max]) {
    if (v !== undefined && v !== null && !(Number.isInteger(v) && (v as number) > 0)) {
      return "rangeMin and rangeMax must be positive whole numbers (or null)";
    }
  }
  if (typeof min === "number" && typeof max === "number" && min > max) {
    return "rangeMin can't be more than rangeMax";
  }
  return null;
}

/**
 * Luke's rule: no half weights — goal weights always round up to the nearest 5.
 * Applies to plan targets only; logged actuals stay exact.
 */
function roundUp5(w: number | null | undefined): number | null {
  if (w == null || !Number.isFinite(w)) return null;
  return Math.ceil(w / 5) * 5;
}

export function registerPlanRoutes(root: FastifyInstance): void {
  root.register(async (app) => {
  app.addHook("preHandler", requireAuth);

  app.get("/api/plans", async () => {
    const rows = db.prepare<[], PlanRow>("SELECT * FROM plans ORDER BY name").all();
    return rows.map(rowToPlan);
  });

  app.post<{ Body: CreatePlanRequest }>("/api/plans", async (request, reply) => {
    const { name, description, kind, items } = request.body;
    if (!name?.trim()) {
      return reply.code(400).send({ error: "name is required" });
    }
    if (items?.some((i) => !isValidExerciseType(i.exerciseType))) {
      return reply.code(400).send(exerciseTypeError);
    }
    const badRange = items?.map((i) => rangeError(i.rangeMin, i.rangeMax)).find(Boolean);
    if (badRange) return reply.code(400).send({ error: badRange });

    const planId = db.transaction(() => {
      const result = db
        .prepare("INSERT INTO plans (name, description, kind) VALUES (?, ?, ?)")
        .run(name.trim(), description ?? null, kind ?? null);
      const id = Number(result.lastInsertRowid);
      if (items?.length) insertPlanItems(id, items);
      return id;
    })();

    return reply.code(201).send(loadPlanDetail(planId));
  });

  app.get<{ Params: { id: string } }>(
    "/api/plans/:id",
    async (request, reply) => {
      const detail = loadPlanDetail(Number(request.params.id));
      if (!detail) return reply.code(404).send({ error: "Not found" });
      return detail;
    }
  );

  app.patch<{ Params: { id: string }; Body: UpdatePlanRequest }>(
    "/api/plans/:id",
    async (request, reply) => {
      const id = Number(request.params.id);
      const existing = db
        .prepare<[number], PlanRow>("SELECT * FROM plans WHERE id = ?")
        .get(id);
      if (!existing) return reply.code(404).send({ error: "Not found" });

      const { name, description, kind } = request.body;
      db.prepare("UPDATE plans SET name = ?, description = ?, kind = ? WHERE id = ?").run(
        name?.trim() ?? existing.name,
        description !== undefined ? description : existing.description,
        kind !== undefined ? kind : existing.kind,
        id
      );
      return loadPlanDetail(id);
    }
  );

  // Recompute every exercise's targets from logged history (also runs
  // automatically when a session from this plan is finished).
  app.post<{ Params: { id: string } }>("/api/plans/:id/progress", async (request, reply) => {
    const planId = Number(request.params.id);
    if (!loadPlanDetail(planId)) return reply.code(404).send({ error: "Not found" });
    const changes = applyProgression(planId);
    const result: ProgressResult = { plan: loadPlanDetail(planId)!, changes };
    return result;
  });

  app.delete<{ Params: { id: string } }>("/api/plans/:id", async (request, reply) => {
    const result = db.prepare("DELETE FROM plans WHERE id = ?").run(request.params.id);
    if (result.changes === 0) return reply.code(404).send({ error: "Not found" });
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string }; Body: CreatePlanItemInput }>(
    "/api/plans/:id/items",
    async (request, reply) => {
      const planId = Number(request.params.id);
      const plan = db
        .prepare<[number], { id: number }>("SELECT id FROM plans WHERE id = ?")
        .get(planId);
      if (!plan) return reply.code(404).send({ error: "Plan not found" });
      if (!isValidExerciseType(request.body.exerciseType)) {
        return reply.code(400).send(exerciseTypeError);
      }
      const badRange = rangeError(request.body.rangeMin, request.body.rangeMax);
      if (badRange) return reply.code(400).send({ error: badRange });

      db.transaction(() => insertPlanItems(planId, [request.body]))();
      return reply.code(201).send(loadPlanDetail(planId));
    }
  );

  app.patch<{
    Params: { id: string; itemId: string };
    Body: UpdatePlanItemInput;
  }>(
    "/api/plans/:id/items/:itemId",
    async (request, reply) => {
      const { name, exerciseType, orderIndex, notes, rangeMin, rangeMax } = request.body;
      if (!isValidExerciseType(exerciseType)) {
        return reply.code(400).send(exerciseTypeError);
      }
      const existing = db
        .prepare<[string, string], PlanItemRow>(
          "SELECT * FROM plan_items WHERE id = ? AND plan_id = ?"
        )
        .get(request.params.itemId, request.params.id);
      if (!existing) return reply.code(404).send({ error: "Not found" });

      const nextMin = rangeMin !== undefined ? rangeMin : existing.range_min;
      const nextMax = rangeMax !== undefined ? rangeMax : existing.range_max;
      const badRange = rangeError(nextMin, nextMax);
      if (badRange) return reply.code(400).send({ error: badRange });

      db.prepare(
        `UPDATE plan_items SET name = ?, exercise_type = ?, order_index = ?, notes = ?,
           range_min = ?, range_max = ?
         WHERE id = ?`
      ).run(
        name?.trim() ?? existing.name,
        exerciseType ?? existing.exercise_type,
        orderIndex ?? existing.order_index,
        notes !== undefined ? notes : existing.notes,
        nextMin,
        nextMax,
        request.params.itemId
      );
      return loadPlanDetail(Number(request.params.id));
    }
  );

  app.delete<{ Params: { id: string; itemId: string } }>(
    "/api/plans/:id/items/:itemId",
    async (request, reply) => {
      const result = db
        .prepare("DELETE FROM plan_items WHERE id = ? AND plan_id = ?")
        .run(request.params.itemId, request.params.id);
      if (result.changes === 0) {
        return reply.code(404).send({ error: "Plan item not found" });
      }
      return reply.code(204).send();
    }
  );

  app.post<{
    Params: { id: string; itemId: string };
    Body: CreatePlanItemSetInput;
  }>(
    "/api/plans/:id/items/:itemId/sets",
    async (request, reply) => {
      const planId = Number(request.params.id);
      const itemId = Number(request.params.itemId);
      const item = db
        .prepare<[number, number], { id: number }>(
          "SELECT id FROM plan_items WHERE id = ? AND plan_id = ?"
        )
        .get(itemId, planId);
      if (!item) return reply.code(404).send({ error: "Plan item not found" });

      const {
        setNumber,
        targetReps,
        targetWeight,
        targetDurationSeconds,
        targetDistanceMeters,
        targetExtra,
      } = request.body;
      db.prepare(
        `INSERT INTO plan_item_sets
           (plan_item_id, set_number, target_reps, target_weight,
            target_duration_seconds, target_distance_meters, target_extra)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        itemId,
        setNumber,
        targetReps ?? null,
        roundUp5(targetWeight),
        targetDurationSeconds ?? null,
        targetDistanceMeters ?? null,
        toJson(targetExtra)
      );
      return reply.code(201).send(loadPlanDetail(planId));
    }
  );

  app.patch<{
    Params: { id: string; itemId: string; setId: string };
    Body: UpdatePlanItemSetInput;
  }>(
    "/api/plans/:id/items/:itemId/sets/:setId",
    async (request, reply) => {
      const planId = Number(request.params.id);
      const itemId = Number(request.params.itemId);
      const existing = db
        .prepare<[string, number, number], PlanItemSetRow>(
          `SELECT s.* FROM plan_item_sets s
           JOIN plan_items i ON i.id = s.plan_item_id
           WHERE s.id = ? AND i.id = ? AND i.plan_id = ?`
        )
        .get(request.params.setId, itemId, planId);
      if (!existing) {
        return reply.code(404).send({ error: "Plan set not found" });
      }

      const {
        setNumber,
        targetReps,
        targetWeight,
        targetDurationSeconds,
        targetDistanceMeters,
        targetExtra,
      } = request.body;
      db.prepare(
        `UPDATE plan_item_sets SET
           set_number = ?, target_reps = ?, target_weight = ?,
           target_duration_seconds = ?, target_distance_meters = ?,
           target_extra = ?
         WHERE id = ?`
      ).run(
        setNumber ?? existing.set_number,
        targetReps !== undefined ? targetReps : existing.target_reps,
        targetWeight !== undefined ? roundUp5(targetWeight) : existing.target_weight,
        targetDurationSeconds !== undefined
          ? targetDurationSeconds
          : existing.target_duration_seconds,
        targetDistanceMeters !== undefined
          ? targetDistanceMeters
          : existing.target_distance_meters,
        targetExtra !== undefined ? toJson(targetExtra) : existing.target_extra,
        request.params.setId
      );
      return loadPlanDetail(planId);
    }
  );

  app.delete<{ Params: { id: string; itemId: string; setId: string } }>(
    "/api/plans/:id/items/:itemId/sets/:setId",
    async (request, reply) => {
      const { id, itemId, setId } = request.params;
      const result = db
        .prepare(
          `DELETE FROM plan_item_sets
           WHERE id = ? AND plan_item_id IN
             (SELECT id FROM plan_items WHERE id = ? AND plan_id = ?)`
        )
        .run(setId, itemId, id);
      if (result.changes === 0) {
        return reply.code(404).send({ error: "Plan set not found" });
      }
      return reply.code(204).send();
    }
  );
  });
}
