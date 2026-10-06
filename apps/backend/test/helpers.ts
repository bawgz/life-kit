// Shared setup for backend tests. node --test runs each test file in its own
// process, so every file gets a fresh app and an empty temp database.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import bcrypt from "bcryptjs";
import type { InjectOptions } from "fastify";

export const API_TOKEN = "test-api-token";
export const PASSWORD = "test-password";

// config and db read env at import time, so set it before importing the app.
const dataDir = mkdtempSync(join(tmpdir(), "life-kit-test-"));
process.env.DB_PATH = join(dataDir, "test.sqlite");
process.env.API_TOKEN = API_TOKEN;
process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);

const { buildApp } = await import("../src/app.js");
export const app = await buildApp();

export async function closeApp(): Promise<void> {
  await app.close();
  rmSync(dataDir, { recursive: true, force: true });
}

export interface Res<T> {
  status: number;
  body: T;
}

/** Authenticated request; returns status plus parsed JSON body (if any). */
export async function api<T = any>(
  method: InjectOptions["method"],
  url: string,
  payload?: object
): Promise<Res<T>> {
  const res = await app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${API_TOKEN}` },
    ...(payload !== undefined && { payload }),
  });
  return { status: res.statusCode, body: res.body ? res.json() : (undefined as T) };
}

/** Creates a one-exercise plan and returns its detail. */
export async function createPlan(overrides: object = {}) {
  const res = await api("POST", "/api/plans", {
    name: "Push Day",
    kind: "upper",
    items: [
      {
        name: "Bench Press",
        orderIndex: 0,
        sets: [
          { setNumber: 1, targetReps: 5, targetWeight: 135 },
          { setNumber: 2, targetReps: 5, targetWeight: 135 },
        ],
      },
    ],
    ...overrides,
  });
  if (res.status !== 201) throw new Error(`createPlan failed: ${res.status}`);
  return res.body;
}
