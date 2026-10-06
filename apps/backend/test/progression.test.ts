// Unit tests for the pure progression engine. Scenarios mirror real logged
// sessions (warm-up ramps, pyramids, equipment swaps, knee pain).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExerciseType } from "@life-kit/shared";
import {
  progressItem,
  repRange,
  type HistorySession,
  type TemplateItem,
} from "../src/progression.js";

function item(
  sets: [reps: number | null, weight: number | null, seconds?: number | null][],
  opts: Partial<Pick<TemplateItem, "name" | "notes" | "rangeMin" | "rangeMax">> & {
    type?: ExerciseType;
  } = {}
): TemplateItem {
  return {
    name: opts.name ?? "Bench",
    exerciseType: opts.type ?? "weighted",
    notes: opts.notes ?? null,
    rangeMin: opts.rangeMin ?? null,
    rangeMax: opts.rangeMax ?? null,
    sets: sets.map(([targetReps, targetWeight, seconds], i) => ({
      id: 100 + i,
      setNumber: i + 1,
      targetReps,
      targetWeight,
      targetDurationSeconds: seconds ?? null,
    })),
  };
}

/** A session where set i was logged as [reps, weight] against the template's targets. */
function session(
  tmpl: TemplateItem,
  logged: ([reps: number | null, weight: number | null] | null)[],
  opts: { date?: string; maxPain?: number | null; seconds?: (number | null)[] } = {}
): HistorySession {
  return {
    date: opts.date ?? "2026-10-05",
    maxPain: opts.maxPain ?? null,
    sets: tmpl.sets.map((t, i) => ({
      setNumber: t.setNumber,
      reps: logged[i]?.[0] ?? null,
      weight: logged[i]?.[1] ?? null,
      durationSeconds: opts.seconds?.[i] ?? null,
      targetReps: t.targetReps,
      targetWeight: t.targetWeight,
      targetDurationSeconds: t.targetDurationSeconds,
    })),
  };
}

const targets = (r: ReturnType<typeof progressItem>) =>
  r!.sets.map((s) => [s.targetReps, s.targetWeight, s.targetDurationSeconds]);

describe("rep range", () => {
  it("prefers an explicit range, then an '8-12 reps' note, then target ± 2", () => {
    assert.deepEqual(repRange(item([[10, 60]], { rangeMin: 6, rangeMax: 8 })), [6, 8]);
    assert.deepEqual(repRange(item([[10, 60]], { notes: "Aim for 8-12 reps; pause." })), [8, 12]);
    assert.deepEqual(repRange(item([[12, 60]])), [10, 14]);
    assert.deepEqual(repRange(item([[1, 60]])), [1, 3]);
  });
});

describe("weighted progression", () => {
  it("returns null with no logged history", () => {
    assert.equal(progressItem(item([[10, 60]]), null, []), null);
  });

  it("adds a rep to each set that hit its goal", () => {
    const t = item([[10, 60], [10, 60], [10, 60]]);
    const r = progressItem(t, null, [session(t, [[10, 60], [10, 60], [10, 60]])]);
    assert.deepEqual(targets(r), [[11, 60, null], [11, 60, null], [11, 60, null]]);
    assert.match(r!.note, /^Oct 5: hit every target → \+1 rep/);
  });

  it("only advances the sets that hit target", () => {
    const t = item([[12, 60], [12, 60], [12, 60]]);
    const r = progressItem(t, null, [session(t, [[12, 60], [10, 60], [9, 60]])]);
    assert.deepEqual(targets(r), [[13, 60, null], [12, 60, null], [12, 60, null]]);
    assert.match(r!.note, /1 of 3 sets hit target/);
  });

  it("adds weight and resets reps once every set reaches the top of the range", () => {
    // Real Leg Day A RDL: warm-up ramp 95/135/135, all 12s against an 8-12 range.
    const t = item([[10, null], [10, null], [10, null]], {
      name: "Romanian Deadlift",
      notes: "Aim for 8-12 reps; slow eccentric.",
    });
    const r = progressItem(t, "legs", [session(t, [[12, 95], [12, 135], [12, 135]])]);
    assert.deepEqual(targets(r), [[8, 100, null], [8, 145, null], [8, 145, null]]);
    assert.match(r!.note, /hit 12 reps on every set → \+10 lb, back to 8 reps/);
  });

  it("uses +5 lb for upper body and light lower-body loads", () => {
    const upper = item([[12, 30], [12, 30]], { name: "DB curls", rangeMin: 8, rangeMax: 12 });
    assert.deepEqual(targets(progressItem(upper, null, [session(upper, [[12, 30], [12, 30]])])), [
      [8, 35, null],
      [8, 35, null],
    ]);
    const lightSquat = item([[12, 60]], { name: "Goblet squat", rangeMin: 8, rangeMax: 12 });
    assert.deepEqual(targets(progressItem(lightSquat, "legs", [session(lightSquat, [[12, 60]])])), [
      [8, 65, null],
    ]);
  });

  it("fills in missing target weights from what was lifted, rounded up to 5", () => {
    // Real Leg Day A squat: no template weight, logged 42/62/62 x10.
    const t = item([[10, null], [10, null], [10, null]], { name: "Squat", notes: "Aim for 8-12 reps" });
    const r = progressItem(t, "legs", [session(t, [[10, 42], [10, 62], [10, 62]])]);
    assert.deepEqual(targets(r), [[11, 45, null], [11, 65, null], [11, 65, null]]);
  });

  it("doesn't lower the target weight after a lighter day", () => {
    const t = item([[12, 60], [12, 60]]);
    const r = progressItem(t, null, [session(t, [[12, 55], [12, 55]])]);
    assert.deepEqual(targets(r), [[12, 60, null], [12, 60, null]], "no credit for reps at a lighter load");
    assert.match(r!.note, /lighter weight than the goal/);
  });

  it("leaves targets alone when the logged load looks like different equipment", () => {
    // Real Upper A: barbell bench (135/155) logged against a 60 lb dumbbell target.
    const t = item([[10, 60], [10, 60], [10, 60]], { name: "DB bench press" });
    const r = progressItem(t, null, [session(t, [[8, 135], [8, 155], [7, 155]])]);
    assert.deepEqual(targets(r), [[10, 60, null], [10, 60, null], [10, 60, null]]);
    assert.match(r!.note, /logged 155 lb against a 60 lb target — different equipment\?/);
  });

  it("only progresses the sets that were logged", () => {
    const t = item([[10, 60], [10, 60], [10, 60]]);
    const r = progressItem(t, null, [session(t, [[10, 60], null, null])]);
    assert.deepEqual(targets(r), [[11, 60, null], [10, 60, null], [10, 60, null]]);
  });

  it("holds on a leg day with knee pain over 3/10", () => {
    const t = item([[12, 100], [12, 100]], { name: "Leg Press", rangeMin: 8, rangeMax: 12 });
    const r = progressItem(t, "legs", [session(t, [[12, 100], [12, 100]], { maxPain: 4 })]);
    assert.deepEqual(targets(r), [[12, 100, null], [12, 100, null]]);
    assert.match(r!.note, /knee pain 4\/10 is over 3/);
  });

  it("ignores knee pain on non-leg plans", () => {
    const t = item([[10, 60]]);
    const r = progressItem(t, null, [session(t, [[10, 60]], { maxPain: 6 })]);
    assert.deepEqual(targets(r), [[11, 60, null]]);
  });

  it("deloads 10% after two sessions below the range", () => {
    const t = item([[8, 135], [8, 135]], { rangeMin: 8, rangeMax: 12 });
    const latest = session(t, [[6, 135], [7, 135]], { date: "2026-10-08" });
    const previous = session(t, [[7, 135], [6, 135]], { date: "2026-10-05" });
    const r = progressItem(t, null, [latest, previous]);
    assert.deepEqual(targets(r), [[8, 120, null], [8, 120, null]]);
    assert.match(r!.note, /below 8 reps two sessions running — weight down 10%/);
  });

  it("holds (no deload) after a single bad session", () => {
    const t = item([[8, 135]], { rangeMin: 8, rangeMax: 12 });
    const r = progressItem(t, null, [session(t, [[6, 135]])]);
    assert.deepEqual(targets(r), [[8, 135, null]]);
    assert.match(r!.note, /target reps not reached/);
  });
});

describe("bodyweight progression", () => {
  it("advances each set of a pyramid on its own", () => {
    // Real Upper A pull-ups: 6/5/3.
    const t = item([[6, null], [5, null], [3, null]], { name: "Pull-ups", type: "bodyweight" });
    const r = progressItem(t, null, [session(t, [[6, null], [5, null], [2, null]])]);
    assert.deepEqual(targets(r), [[7, null, null], [6, null, null], [3, null, null]]);
  });

  it("suggests load at the top of the range instead of adding it unasked", () => {
    const t = item([[12, null], [12, null]], { name: "Dead bugs", type: "bodyweight", rangeMin: 10, rangeMax: 12 });
    const r = progressItem(t, null, [session(t, [[12, null], [12, null]])]);
    assert.deepEqual(targets(r), [[12, null, null], [12, null, null]]);
    assert.match(r!.note, /top of the 10–12 range at bodyweight — add load/);
  });

  it("adds load once added load is already in use", () => {
    const t = item([[10, 10], [10, 10]], { name: "Dips", type: "bodyweight", rangeMin: 6, rangeMax: 10 });
    const r = progressItem(t, null, [session(t, [[10, 10], [10, 10]])]);
    assert.deepEqual(targets(r), [[6, 15, null], [6, 15, null]]);
  });
});

describe("timed progression", () => {
  it("adds 5 seconds to holds that hit target, up to the cap", () => {
    const t = item([[null, null, 30], [null, null, 30]], { name: "Plank", type: "timed" });
    const r = progressItem(t, null, [session(t, [null, null], { seconds: [32, 25] })]);
    assert.deepEqual(targets(r), [[null, null, 35], [null, null, 30]]);
    assert.match(r!.note, /1 of 2 holds hit target/);
  });

  it("stops at the cap and says to add load", () => {
    // Spanish squat holds: the clinical dose is 45s; capping the range there
    // means progress comes from load, not longer holds.
    const t = item([[null, null, 45]], { name: "Spanish squat holds", type: "timed", rangeMin: 45, rangeMax: 45 });
    const r = progressItem(t, "legs", [session(t, [null], { seconds: [45] })]);
    assert.deepEqual(targets(r), [[null, null, 45]]);
    assert.match(r!.note, /at the 45s cap on every set — progress by adding load/);
  });

  it("holds on a leg day with knee pain over 3/10", () => {
    const t = item([[null, null, 30]], { name: "Wall sit", type: "timed" });
    const r = progressItem(t, "legs", [session(t, [null], { seconds: [30], maxPain: 5 })]);
    assert.deepEqual(targets(r), [[null, null, 30]]);
  });
});
