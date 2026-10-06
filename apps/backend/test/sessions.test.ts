import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import type { Session, SessionDetail } from "@life-kit/shared";
import { api, closeApp, createPlan } from "./helpers.js";

after(closeApp);

async function startSession(body: object): Promise<SessionDetail> {
  const res = await api<SessionDetail>("POST", "/api/sessions", { date: "2030-06-01", ...body });
  assert.equal(res.status, 201);
  return res.body;
}

describe("sessions", () => {
  it("requires a date", async () => {
    assert.equal((await api("POST", "/api/sessions", {})).status, 400);
  });

  it("starts an ad-hoc session with no items", async () => {
    const s = await startSession({ notes: "walk-in" });
    assert.equal(s.planId, null);
    assert.equal(s.planName, null);
    assert.ok(s.startedAt);
    assert.deepEqual(s.items, []);
  });

  it("copies the plan's items and targets as placeholder sets", async () => {
    const plan = await createPlan();
    const s = await startSession({ planId: plan.id });

    assert.equal(s.planId, plan.id);
    assert.equal(s.planName, "Push Day");
    assert.equal(s.planKind, "upper");
    assert.equal(s.items.length, 1);
    assert.equal(s.items[0].name, "Bench Press");
    assert.deepEqual(
      s.items[0].sets.map((x) => [x.setNumber, x.targetReps, x.targetWeight, x.reps, x.completedAt]),
      [
        [1, 5, 135, null, null],
        [2, 5, 135, null, null],
      ]
    );
  });

  it("inherits the plan from a scheduled workout", async () => {
    const plan = await createPlan({ name: "Leg Day", kind: "legs" });
    const scheduled = await api("POST", "/api/scheduled-workouts", {
      planId: plan.id,
      scheduledDate: "2030-06-02",
    });
    const s = await startSession({ scheduledWorkoutId: scheduled.body.id });
    assert.equal(s.scheduledWorkoutId, scheduled.body.id);
    assert.equal(s.planId, plan.id);
    assert.equal(s.planName, "Leg Day");
    assert.equal(s.items.length, 1);
  });

  it("404s an unknown session", async () => {
    assert.equal((await api("GET", "/api/sessions/999999")).status, 404);
    assert.equal((await api("PATCH", "/api/sessions/999999", { notes: "x" })).status, 404);
    assert.equal((await api("DELETE", "/api/sessions/999999")).status, 404);
    assert.equal(
      (await api("POST", "/api/sessions/999999/items", { name: "x", orderIndex: 0 })).status,
      404
    );
  });

  it("records pain scores and completion, keeping unspecified fields", async () => {
    const s = await startSession({ notes: "keep", painDuring: 2 });
    const patched = await api<SessionDetail>("PATCH", `/api/sessions/${s.id}`, {
      painAfter: 3,
      completedAt: "2030-06-01T18:00:00.000Z",
    });
    assert.equal(patched.body.notes, "keep");
    assert.equal(patched.body.painDuring, 2);
    assert.equal(patched.body.painAfter, 3);
    assert.equal(patched.body.completedAt, "2030-06-01T18:00:00.000Z");

    const nextDay = await api<SessionDetail>("PATCH", `/api/sessions/${s.id}`, { painNextMorning: 1 });
    assert.equal(nextDay.body.painAfter, 3);
    assert.equal(nextDay.body.painNextMorning, 1);
  });

  it("lists sessions in a date range, newest first", async () => {
    for (const date of ["2033-01-01", "2033-01-02", "2033-01-03"]) {
      await startSession({ date });
    }
    const res = await api<Session[]>("GET", "/api/sessions?from=2033-01-01&to=2033-01-02");
    assert.deepEqual(res.body.map((x) => x.date), ["2033-01-02", "2033-01-01"]);
  });

  it("deletes a session", async () => {
    const s = await startSession({});
    assert.equal((await api("DELETE", `/api/sessions/${s.id}`)).status, 204);
    assert.equal((await api("GET", `/api/sessions/${s.id}`)).status, 404);
  });

  it("keeps sessions when their plan is deleted, unlinked", async () => {
    const plan = await createPlan();
    const s = await startSession({ planId: plan.id });
    await api("DELETE", `/api/plans/${plan.id}`);

    const kept = await api<SessionDetail>("GET", `/api/sessions/${s.id}`);
    assert.equal(kept.status, 200);
    assert.equal(kept.body.planId, null);
    assert.equal(kept.body.items.length, 1, "logged history is not deleted with the plan");
  });
});

describe("session items and sets", () => {
  it("fills in the plan's placeholder set instead of adding a duplicate", async () => {
    const plan = await createPlan();
    const s = await startSession({ planId: plan.id });
    const item = s.items[0];

    const logged = await api<SessionDetail>("POST", `/api/sessions/${s.id}/items/${item.id}/sets`, {
      setNumber: 1,
      reps: 6,
      weight: 132.5,
    });
    assert.equal(logged.status, 201);
    const sets = logged.body.items[0].sets;
    assert.equal(sets.length, 2, "no duplicate row for set 1");
    assert.equal(sets[0].reps, 6);
    assert.equal(sets[0].weight, 132.5, "logged weights are not rounded");
    assert.equal(sets[0].targetWeight, 135, "target is preserved");
    assert.ok(sets[0].completedAt);
  });

  it("adds a new row for a set beyond the plan, or a second log of the same set", async () => {
    const plan = await createPlan();
    const s = await startSession({ planId: plan.id });
    const url = `/api/sessions/${s.id}/items/${s.items[0].id}/sets`;

    await api("POST", url, { setNumber: 1, reps: 5 });
    await api("POST", url, { setNumber: 1, reps: 5 });
    const extra = await api<SessionDetail>("POST", url, { setNumber: 3, reps: 4, extra: { rpe: 9 } });

    const sets = extra.body.items[0].sets;
    assert.deepEqual(sets.map((x) => x.setNumber), [1, 1, 2, 3]);
    assert.deepEqual(sets.at(-1)!.extra, { rpe: 9 });
    assert.equal(sets.at(-1)!.targetReps, null);
  });

  it("copies each exercise's type from the plan", async () => {
    const plan = await createPlan({
      items: [
        { name: "Bench", orderIndex: 0, sets: [{ setNumber: 1, targetReps: 5 }] },
        { name: "Dips", exerciseType: "bodyweight", orderIndex: 1, sets: [{ setNumber: 1, targetReps: 8 }] },
        { name: "Plank", exerciseType: "timed", orderIndex: 2, sets: [{ setNumber: 1, targetDurationSeconds: 45 }] },
      ],
    });
    const s = await startSession({ planId: plan.id });
    assert.deepEqual(
      s.items.map((i) => [i.name, i.exerciseType]),
      [
        ["Bench", "weighted"],
        ["Dips", "bodyweight"],
        ["Plank", "timed"],
      ]
    );
    assert.equal(s.items[2].sets[0].targetDurationSeconds, 45);
  });

  it("logs a timed set as a duration", async () => {
    const s = await startSession({});
    const added = await api<SessionDetail>("POST", `/api/sessions/${s.id}/items`, {
      name: "Wall sit",
      exerciseType: "timed",
      orderIndex: 0,
    });
    assert.equal(added.body.items[0].exerciseType, "timed");
    const item = added.body.items[0];
    const logged = await api<SessionDetail>("POST", `/api/sessions/${s.id}/items/${item.id}/sets`, {
      setNumber: 1,
      durationSeconds: 90,
    });
    assert.equal(logged.body.items[0].sets[0].durationSeconds, 90);
    assert.equal(logged.body.items[0].sets[0].reps, null);
  });

  it("rejects an unknown exercise type on an ad-hoc item", async () => {
    const s = await startSession({});
    const res = await api("POST", `/api/sessions/${s.id}/items`, {
      name: "x",
      exerciseType: "cardio",
      orderIndex: 0,
    });
    assert.equal(res.status, 400);
  });

  it("adds, logs against, and deletes an ad-hoc item", async () => {
    const s = await startSession({});
    const added = await api<SessionDetail>("POST", `/api/sessions/${s.id}/items`, {
      name: "Plank",
      orderIndex: 0,
    });
    assert.equal(added.status, 201);
    const item = added.body.items[0];

    const logged = await api<SessionDetail>("POST", `/api/sessions/${s.id}/items/${item.id}/sets`, {
      setNumber: 1,
      durationSeconds: 60,
    });
    assert.equal(logged.body.items[0].sets[0].durationSeconds, 60);

    const deleted = await api<SessionDetail>("DELETE", `/api/sessions/${s.id}/items/${item.id}`);
    assert.equal(deleted.status, 200);
    assert.deepEqual(deleted.body.items, []);
  });

  it("corrects and deletes a logged set", async () => {
    const s = await startSession({});
    const item = (await api<SessionDetail>("POST", `/api/sessions/${s.id}/items`, {
      name: "Row",
      orderIndex: 0,
    })).body.items[0];
    const logged = await api<SessionDetail>("POST", `/api/sessions/${s.id}/items/${item.id}/sets`, {
      setNumber: 1,
      reps: 8,
      weight: 100,
    });
    const set = logged.body.items[0].sets[0];
    const setUrl = `/api/sessions/${s.id}/items/${item.id}/sets/${set.id}`;

    const fixed = await api<SessionDetail>("PATCH", setUrl, { weight: 110 });
    assert.equal(fixed.status, 200);
    assert.equal(fixed.body.items[0].sets[0].weight, 110);
    assert.equal(fixed.body.items[0].sets[0].reps, 8);

    assert.equal((await api("DELETE", setUrl)).status, 204);
    assert.equal((await api("DELETE", setUrl)).status, 404);
  });

  it("refuses to touch items and sets through a different session's URL", async () => {
    const plan = await createPlan();
    const a = await startSession({ planId: plan.id });
    const b = await startSession({ planId: plan.id });
    const itemA = a.items[0];
    const setA = itemA.sets[0];

    assert.equal(
      (await api("POST", `/api/sessions/${b.id}/items/${itemA.id}/sets`, { setNumber: 1, reps: 1 })).status,
      404
    );
    assert.equal(
      (await api("PATCH", `/api/sessions/${b.id}/items/${itemA.id}/sets/${setA.id}`, { reps: 1 })).status,
      404
    );
    assert.equal(
      (await api("DELETE", `/api/sessions/${b.id}/items/${itemA.id}/sets/${setA.id}`)).status,
      404
    );
    assert.equal((await api("DELETE", `/api/sessions/${b.id}/items/${itemA.id}`)).status, 404);

    const untouched = await api<SessionDetail>("GET", `/api/sessions/${a.id}`);
    assert.equal(untouched.body.items.length, 1);
    assert.equal(untouched.body.items[0].sets.length, 2);
    assert.equal(untouched.body.items[0].sets[0].reps, null);
  });
});
