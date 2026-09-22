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

/** Parse a nullable JSON TEXT column back into an object/array, or null. */
export function parseJson<T>(value: string | null): T | null {
  return value === null ? null : (JSON.parse(value) as T);
}

/** Serialize a value for storage in a JSON TEXT column. */
export function toJson(value: unknown): string | null {
  return value === undefined || value === null ? null : JSON.stringify(value);
}
