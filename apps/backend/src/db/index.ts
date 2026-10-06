import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";

const dbFilePath = resolve(config.dbPath);
mkdirSync(dirname(dbFilePath), { recursive: true });

export const db = new Database(dbFilePath);

const schemaPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "schema.sql"
);
db.exec(readFileSync(schemaPath, "utf-8"));

// Idempotent migrations for databases created before a column existed.
// schema.sql only runs CREATE TABLE IF NOT EXISTS, so existing tables never
// pick up new columns from it — add them here instead.
function columnExists(table: string, column: string): boolean {
  const rows = db
    .prepare(`PRAGMA table_info(${table})`)
    .all() as { name: string }[];
  return rows.some((r) => r.name === column);
}

function addColumnIfMissing(table: string, column: string, ddl: string): void {
  if (!columnExists(table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

addColumnIfMissing("plans", "kind", "TEXT");
addColumnIfMissing("sessions", "plan_id", "INTEGER REFERENCES plans(id) ON DELETE SET NULL");
addColumnIfMissing("sessions", "pain_during", "INTEGER");
addColumnIfMissing("sessions", "pain_after", "INTEGER");
addColumnIfMissing("sessions", "pain_next_morning", "INTEGER");
addColumnIfMissing("session_item_sets", "target_reps", "INTEGER");
addColumnIfMissing("session_item_sets", "target_weight", "REAL");
addColumnIfMissing("session_item_sets", "target_duration_seconds", "INTEGER");
addColumnIfMissing("session_item_sets", "target_distance_meters", "REAL");
addColumnIfMissing("plan_items", "range_min", "INTEGER");
addColumnIfMissing("plan_items", "range_max", "INTEGER");
addColumnIfMissing("plan_items", "progress_note", "TEXT");

const EXERCISE_TYPE_DDL =
  "TEXT NOT NULL DEFAULT 'weighted' CHECK (exercise_type IN ('weighted', 'bodyweight', 'timed'))";

// One-time backfill when exercise_type first appears: before it existed,
// timed work was stored as a duration with no reps, and bodyweight as a
// weight of 0 (or a "bodyweight" note). Runs inside the same check as the
// ALTER so it never re-classifies exercises edited afterwards.
if (!columnExists("plan_items", "exercise_type")) {
  db.transaction(() => {
    db.exec(`ALTER TABLE plan_items ADD COLUMN exercise_type ${EXERCISE_TYPE_DDL}`);
    db.exec(`ALTER TABLE session_items ADD COLUMN exercise_type ${EXERCISE_TYPE_DDL}`);
    for (const [items, sets, fk] of [
      ["plan_items", "plan_item_sets", "plan_item_id"],
      ["session_items", "session_item_sets", "session_item_id"],
    ]) {
      const setsOf = `FROM ${sets} s WHERE s.${fk} = ${items}.id`;
      // A target of 0 seconds / 0 meters is an import artifact, not a goal.
      db.exec(`UPDATE ${sets} SET target_duration_seconds = NULL WHERE target_duration_seconds = 0`);
      db.exec(`UPDATE ${sets} SET target_distance_meters = NULL WHERE target_distance_meters = 0`);
      db.exec(`
        UPDATE ${items} SET exercise_type = 'timed'
        WHERE EXISTS (SELECT 1 ${setsOf} AND s.target_duration_seconds > 0)
          AND NOT EXISTS (SELECT 1 ${setsOf} AND s.target_reps IS NOT NULL)`);
      db.exec(`
        UPDATE ${items} SET exercise_type = 'bodyweight'
        WHERE exercise_type = 'weighted'
          AND (lower(coalesce(notes, '')) LIKE '%bodyweight%'
               OR (EXISTS (SELECT 1 ${setsOf} AND s.target_weight = 0)
                   AND NOT EXISTS (SELECT 1 ${setsOf} AND coalesce(s.target_weight, 0) <> 0)))`);
      // For bodyweight, weight now means added load: 0 becomes "no added load".
      db.exec(`
        UPDATE ${sets} SET target_weight = NULL
        WHERE target_weight = 0 AND ${fk} IN
          (SELECT id FROM ${items} WHERE exercise_type = 'bodyweight')`);
    }
    // Logged actuals on bodyweight session items: 0 also meant "just bodyweight".
    db.exec(`
      UPDATE session_item_sets SET weight = NULL
      WHERE weight = 0 AND session_item_id IN
        (SELECT id FROM session_items WHERE exercise_type = 'bodyweight')`);
    // Logged 0 seconds / 0 meters are the same import artifact as above.
    db.exec(`UPDATE session_item_sets SET duration_seconds = NULL WHERE duration_seconds = 0`);
    db.exec(`UPDATE session_item_sets SET distance_meters = NULL WHERE distance_meters = 0`);
  })();
}

/** Parse a nullable JSON TEXT column back into an object/array, or null. */
export function parseJson<T>(value: string | null): T | null {
  return value === null ? null : (JSON.parse(value) as T);
}

/** Serialize a value for storage in a JSON TEXT column. */
export function toJson(value: unknown): string | null {
  return value === undefined || value === null ? null : JSON.stringify(value);
}
