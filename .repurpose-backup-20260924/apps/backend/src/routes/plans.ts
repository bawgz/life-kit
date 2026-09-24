import type { FastifyInstance } from "fastify";
import type {
  CreatePlanItemInput,
  CreatePlanRequest,
  Plan,
  PlanDetail,
  PlanItem,
  PlanItemSet,
  UpdatePlanRequest,
} from "@life-kit/shared";
import { db, parseJson, toJson } from "../db/index.js";
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
  orderIndex: row.order_index,
  notes: row.notes,
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
    `INSERT INTO plan_items (plan_id, name, order_index, notes)
     VALUES (?, ?, ?, ?)`
  );
  const insertSet = db.prepare(
    `INSERT INTO plan_item_sets
       (plan_item_id, set_number, target_reps, target_weight,
        target_duration_seconds, target_distance_meters, target_extra)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  for (const item of items) {
    const itemResult = insertItem.run(planId, item.name, item.orderIndex, item.notes ?? null);
    const planItemId = Number(itemResult.lastInsertRowid);
    for (const set of item.sets) {
      insertSet.run(
        planItemId,
        set.setNumber,
        set.targetReps ?? null,
        set.targetWeight ?? null,
        set.targetDurationSeconds ?? null,
        set.targetDistanceMeters ?? null,
        toJson(set.targetExtra)
      );
    }
  }
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

  app.delete<{ Params: { id: string } }>("/api/plans/:id", async (request, reply) => {
    db.prepare("DELETE FROM plans WHERE id = ?").run(request.params.id);
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

      db.transaction(() => insertPlanItems(planId, [request.body]))();
      return reply.code(201).send(loadPlanDetail(planId));
    }
  );

  app.patch<{
    Params: { id: string; itemId: string };
    Body: { name?: string; orderIndex?: number; notes?: string | null };
  }>(
    "/api/plans/:id/items/:itemId",
    async (request, reply) => {
      const { name, orderIndex, notes } = request.body;
      const existing = db
        .prepare<[string], PlanItemRow>("SELECT * FROM plan_items WHERE id = ?")
        .get(request.params.itemId);
      if (!existing) return reply.code(404).send({ error: "Not found" });

      db.prepare("UPDATE plan_items SET name = ?, order_index = ?, notes = ? WHERE id = ?").run(
        name?.trim() ?? existing.name,
        orderIndex ?? existing.order_index,
        notes !== undefined ? notes : existing.notes,
        request.params.itemId
      );
      return loadPlanDetail(Number(request.params.id));
    }
  );

  app.delete<{ Params: { id: string; itemId: string } }>(
    "/api/plans/:id/items/:itemId",
    async (request, reply) => {
      db.prepare("DELETE FROM plan_items WHERE id = ?").run(request.params.itemId);
      return reply.code(204).send();
    }
  );
  });
}
