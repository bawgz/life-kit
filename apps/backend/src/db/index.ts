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

/** Parse a nullable JSON TEXT column back into an object/array, or null. */
export function parseJson<T>(value: string | null): T | null {
  return value === null ? null : (JSON.parse(value) as T);
}

/** Serialize a value for storage in a JSON TEXT column. */
export function toJson(value: unknown): string | null {
  return value === undefined || value === null ? null : JSON.stringify(value);
}
