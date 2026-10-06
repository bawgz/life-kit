// Applies the progression engine to a plan: loads each exercise's recent
// history, computes next targets, and writes them back to the template.
// Recomputes from the latest logged session each time, so running it twice
// for the same history gives the same targets.
import type { ExerciseType, ProgressChange } from "@life-kit/shared";
import { db } from "./db/index.js";
import {
  progressItem,
  type HistorySession,
  type HistorySet,
  type TemplateSet,
} from "./progression.js";

interface ItemRow {
  id: number;
  name: string;
  exercise_type: ExerciseType;
  notes: string | null;
  range_min: number | null;
  range_max: number | null;
}

interface HistoryItemRow {
  session_item_id: number;
  date: string;
  pain_during: number | null;
  pain_after: number | null;
  pain_next_morning: number | null;
}

/** How many past sessions the engine looks at (latest, plus one for the deload rule). */
const HISTORY_DEPTH = 2;

function loadHistory(planId: number, name: string): HistorySession[] {
  const items = db
    .prepare<[number, string], HistoryItemRow>(
      `SELECT si.id AS session_item_id, s.date,
              s.pain_during, s.pain_after, s.pain_next_morning
       FROM session_items si
       JOIN sessions s ON s.id = si.session_id
       LEFT JOIN scheduled_workouts sw ON sw.id = s.scheduled_workout_id
       WHERE COALESCE(s.plan_id, sw.plan_id) = ?
         AND lower(trim(si.name)) = lower(trim(?))
       ORDER BY s.date DESC, s.id DESC`
    )
    .all(planId, name);
  const setsStmt = db.prepare<[number], HistorySet>(
    `SELECT set_number AS setNumber, reps, weight, duration_seconds AS durationSeconds,
            target_reps AS targetReps, target_weight AS targetWeight,
            target_duration_seconds AS targetDurationSeconds
     FROM session_item_sets WHERE session_item_id = ? ORDER BY set_number`
  );

  const history: HistorySession[] = [];
  for (const row of items) {
    const sets = setsStmt.all(row.session_item_id);
    // Only sessions where this exercise was actually logged count.
    if (!sets.some((s) => s.reps != null || s.durationSeconds != null)) continue;
    const pains = [row.pain_during, row.pain_after, row.pain_next_morning].filter(
      (p): p is number => p != null
    );
    history.push({
      date: row.date,
      maxPain: pains.length ? Math.max(...pains) : null,
      sets,
    });
    if (history.length === HISTORY_DEPTH) break;
  }
  return history;
}

/** Recomputes every exercise's targets in a plan from its logged history. */
export function applyProgression(planId: number): ProgressChange[] {
  const plan = db
    .prepare<[number], { kind: string | null }>("SELECT kind FROM plans WHERE id = ?")
    .get(planId);
  if (!plan) return [];

  const items = db
    .prepare<[number], ItemRow>(
      `SELECT id, name, exercise_type, notes, range_min, range_max
       FROM plan_items WHERE plan_id = ? ORDER BY order_index`
    )
    .all(planId);
  const setsStmt = db.prepare<[number], TemplateSet>(
    `SELECT id, set_number AS setNumber, target_reps AS targetReps,
            target_weight AS targetWeight, target_duration_seconds AS targetDurationSeconds
     FROM plan_item_sets WHERE plan_item_id = ? ORDER BY set_number`
  );
  const updateSet = db.prepare(
    `UPDATE plan_item_sets
     SET target_reps = ?, target_weight = ?, target_duration_seconds = ?
     WHERE id = ?`
  );
  const updateNote = db.prepare("UPDATE plan_items SET progress_note = ? WHERE id = ?");

  const changes: ProgressChange[] = [];
  db.transaction(() => {
    for (const item of items) {
      const sets = setsStmt.all(item.id);
      const result = progressItem(
        {
          name: item.name,
          exerciseType: item.exercise_type,
          notes: item.notes,
          rangeMin: item.range_min,
          rangeMax: item.range_max,
          sets,
        },
        plan.kind,
        loadHistory(planId, item.name)
      );
      if (!result) continue;

      let changed = false;
      result.sets.forEach((next, i) => {
        const before = sets[i];
        if (
          next.targetReps !== before.targetReps ||
          next.targetWeight !== before.targetWeight ||
          next.targetDurationSeconds !== before.targetDurationSeconds
        ) {
          changed = true;
          updateSet.run(next.targetReps, next.targetWeight, next.targetDurationSeconds, next.id);
        }
      });
      updateNote.run(result.note, item.id);
      changes.push({ planItemId: item.id, name: item.name, note: result.note, changed });
    }
  })();
  return changes;
}
