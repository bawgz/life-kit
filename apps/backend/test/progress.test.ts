import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import type { PlanDetail, ProgressResult, SessionDetail } from "@life-kit/shared";
import { api, closeApp, createPlan } from "./helpers.js";

after(closeApp);

/** Starts a session from the plan and logs every set at the given reps/weight. */
async function logWorkout(planId: number, reps: number, weight: number, date = "2030-03-01") {
  const s = (await api<SessionDetail>("POST", "/api/sessions", { planId, date })).body;
  for (const item of s.items) {
    for (const set of item.sets) {
      await api("POST", `/api/sessions/${s.id}/items/${item.id}/sets`, {
        setNumber: set.setNumber,
        reps,
        weight,
      });
    }
  }
  return s;
}

describe("progression", () => {
  it("moves the template forward when a session is finished", async () => {
    const plan: PlanDetail = await createPlan();
    const s = await logWorkout(plan.id, 5, 135);

    const before = await api<PlanDetail>("GET", `/api/plans/${plan.id}`);
    assert.equal(before.body.items[0].sets[0].targetReps, 5, "logging alone doesn't change targets");

    await api("PATCH", `/api/sessions/${s.id}`, { completedAt: "2030-03-01T18:00:00.000Z" });
    const after = await api<PlanDetail>("GET", `/api/plans/${plan.id}`);
    const bench = after.body.items[0];
    assert.deepEqual(bench.sets.map((x) => [x.targetReps, x.targetWeight]), [
      [6, 135],
      [6, 135],
    ]);
    assert.match(bench.progressNote ?? "", /hit every target → \+1 rep/);
  });

  it("doesn't progress again when an already-finished session is edited", async () => {
    const plan: PlanDetail = await createPlan();
    const s = await logWorkout(plan.id, 5, 135);
    await api("PATCH", `/api/sessions/${s.id}`, { completedAt: "2030-03-01T18:00:00.000Z" });
    await api("PATCH", `/api/sessions/${s.id}`, { completedAt: "2030-03-01T19:00:00.000Z", notes: "x" });
    const after = await api<PlanDetail>("GET", `/api/plans/${plan.id}`);
    assert.equal(after.body.items[0].sets[0].targetReps, 6);
  });

  it("recalculates on demand, and gives the same answer twice", async () => {
    const plan: PlanDetail = await createPlan({
      items: [
        {
          name: "Leg Press",
          orderIndex: 0,
          rangeMin: 8,
          rangeMax: 12,
          sets: [{ setNumber: 1, targetReps: 12 }],
        },
      ],
      kind: "legs",
    });
    assert.deepEqual([plan.items[0].rangeMin, plan.items[0].rangeMax], [8, 12]);
    await logWorkout(plan.id, 12, 230);

    const first = await api<ProgressResult>("POST", `/api/plans/${plan.id}/progress`);
    assert.equal(first.status, 200);
    assert.deepEqual(first.body.changes, [
      {
        planItemId: plan.items[0].id,
        name: "Leg Press",
        note: "Mar 1: hit 12 reps on every set → +10 lb, back to 8 reps.",
        changed: true,
      },
    ]);
    assert.deepEqual(
      first.body.plan.items[0].sets.map((x) => [x.targetReps, x.targetWeight]),
      [[8, 240]]
    );

    const second = await api<ProgressResult>("POST", `/api/plans/${plan.id}/progress`);
    assert.equal(second.body.changes[0].changed, false, "same history, same targets");
    assert.equal(second.body.plan.items[0].sets[0].targetWeight, 240);
  });

  it("uses only sessions from the same plan", async () => {
    const a: PlanDetail = await createPlan({ name: "A" });
    const b: PlanDetail = await createPlan({ name: "B" });
    await logWorkout(a.id, 5, 135);
    const res = await api<ProgressResult>("POST", `/api/plans/${b.id}/progress`);
    assert.deepEqual(res.body.changes, [], "no history for B's bench yet");
  });

  it("404s an unknown plan", async () => {
    assert.equal((await api("POST", "/api/plans/999999/progress")).status, 404);
  });
});

describe("progression ranges", () => {
  it("stores and clears a range", async () => {
    const plan: PlanDetail = await createPlan();
    const url = `/api/plans/${plan.id}/items/${plan.items[0].id}`;
    const set = await api<PlanDetail>("PATCH", url, { rangeMin: 8, rangeMax: 12 });
    assert.deepEqual([set.body.items[0].rangeMin, set.body.items[0].rangeMax], [8, 12]);
    const cleared = await api<PlanDetail>("PATCH", url, { rangeMin: null, rangeMax: null });
    assert.deepEqual([cleared.body.items[0].rangeMin, cleared.body.items[0].rangeMax], [null, null]);
  });

  it("rejects bad ranges", async () => {
    const plan: PlanDetail = await createPlan();
    const url = `/api/plans/${plan.id}/items/${plan.items[0].id}`;
    assert.equal((await api("PATCH", url, { rangeMin: 12, rangeMax: 8 })).status, 400);
    assert.equal((await api("PATCH", url, { rangeMin: 0 })).status, 400);
    assert.equal((await api("PATCH", url, { rangeMax: 7.5 })).status, 400);
  });
});
