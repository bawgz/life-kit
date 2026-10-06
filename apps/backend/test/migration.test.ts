// Starts the app against a database created with the pre-exercise_type
// schema, holding rows shaped like real production data, and checks the
// one-time backfill. Doesn't use helpers.ts: the old DB must exist first.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import Database from "better-sqlite3";
import type { PlanDetail, SessionDetail } from "@life-kit/shared";

const dataDir = mkdtempSync(join(tmpdir(), "life-kit-migration-test-"));
const dbPath = join(dataDir, "old.sqlite");

// The schema as it was before exercise_type existed.
const oldSchema = readFileSync(new URL("../src/db/schema.sql", import.meta.url), "utf-8")
  .split("\n")
  .filter((line) => !line.includes("exercise_type"))
  .join("\n");
assert.ok(!oldSchema.includes("exercise_type"));

const old = new Database(dbPath);
old.exec(oldSchema);
old.exec(`
  INSERT INTO plans (id, name) VALUES (1, 'Mixed');
  INSERT INTO plan_items (id, plan_id, name, order_index, notes) VALUES
    (1, 1, 'Bench', 0, NULL),
    (2, 1, 'Pull-ups', 1, NULL),
    (3, 1, 'Dead bugs', 2, 'per side, bodyweight'),
    (4, 1, 'Spanish squat holds', 3, NULL),
    (5, 1, 'Clamshells', 4, 'Per side');
  INSERT INTO plan_item_sets
    (plan_item_id, set_number, target_reps, target_weight, target_duration_seconds, target_distance_meters) VALUES
    (1, 1, 10, 60, 0, 0),     -- weighted, with 0s import artifacts
    (2, 1, 6, 0, 0, 0),       -- weight 0 => bodyweight
    (2, 2, 5, 0, 0, 0),
    (3, 1, 12, NULL, NULL, NULL), -- note says bodyweight
    (4, 1, NULL, NULL, 45, NULL), -- duration, no reps => timed
    (5, 1, 15, NULL, NULL, NULL); -- no weight, no hint => stays weighted

  INSERT INTO sessions (id, plan_id, date) VALUES (1, 1, '2026-09-15');
  INSERT INTO session_items (id, session_id, name, order_index) VALUES
    (1, 1, 'Pull-ups', 0),
    (2, 1, 'Spanish squat holds', 1);
  INSERT INTO session_item_sets
    (session_item_id, set_number, reps, weight, duration_seconds, target_reps, target_weight, target_duration_seconds) VALUES
    (1, 1, 6, 0, 0, 6, 0, 0),
    (2, 1, NULL, NULL, 50, NULL, NULL, 45);
`);
old.close();

process.env.DB_PATH = dbPath;
process.env.API_TOKEN = "t";
process.env.ADMIN_PASSWORD_HASH = "unused";
const { buildApp } = await import("../src/app.js");
const app = await buildApp();

after(async () => {
  await app.close();
  rmSync(dataDir, { recursive: true, force: true });
});

async function get<T>(url: string): Promise<T> {
  const res = await app.inject({ method: "GET", url, headers: { authorization: "Bearer t" } });
  assert.equal(res.statusCode, 200);
  return res.json() as T;
}

describe("exercise_type backfill", () => {
  it("classifies existing plan exercises", async () => {
    const plan = await get<PlanDetail>("/api/plans/1");
    assert.deepEqual(
      plan.items.map((i) => [i.name, i.exerciseType]),
      [
        ["Bench", "weighted"],
        ["Pull-ups", "bodyweight"],
        ["Dead bugs", "bodyweight"],
        ["Spanish squat holds", "timed"],
        ["Clamshells", "weighted"],
      ]
    );
  });

  it("clears 0-second / 0-meter targets and 0 bodyweight loads", async () => {
    const plan = await get<PlanDetail>("/api/plans/1");
    const [bench, pullups, , holds] = plan.items;
    assert.equal(bench.sets[0].targetWeight, 60);
    assert.equal(bench.sets[0].targetDurationSeconds, null);
    assert.equal(bench.sets[0].targetDistanceMeters, null);
    assert.deepEqual(pullups.sets.map((s) => s.targetWeight), [null, null]);
    assert.equal(holds.sets[0].targetDurationSeconds, 45);
  });

  it("classifies and cleans past session data the same way", async () => {
    const s = await get<SessionDetail>("/api/sessions/1");
    assert.deepEqual(s.items.map((i) => i.exerciseType), ["bodyweight", "timed"]);
    const pullup = s.items[0].sets[0];
    assert.equal(pullup.reps, 6);
    assert.equal(pullup.weight, null);
    assert.equal(pullup.targetWeight, null);
    assert.equal(pullup.durationSeconds, null);
    assert.equal(s.items[1].sets[0].durationSeconds, 50);
  });
});
