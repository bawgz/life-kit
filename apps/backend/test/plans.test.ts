import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import type { Plan, PlanDetail } from "@life-kit/shared";
import { api, closeApp, createPlan } from "./helpers.js";

after(closeApp);

describe("plans", () => {
  it("creates a plan with nested items and sets", async () => {
    const plan: PlanDetail = await createPlan();
    assert.equal(plan.name, "Push Day");
    assert.equal(plan.kind, "upper");
    assert.equal(plan.items.length, 1);
    assert.equal(plan.items[0].name, "Bench Press");
    assert.deepEqual(
      plan.items[0].sets.map((s) => [s.setNumber, s.targetReps, s.targetWeight]),
      [
        [1, 5, 135],
        [2, 5, 135],
      ]
    );
  });

  it("requires a name", async () => {
    const res = await api("POST", "/api/plans", { name: "  " });
    assert.equal(res.status, 400);
  });

  it("rounds goal weights up to the nearest 5 on create", async () => {
    const plan = await createPlan({
      items: [
        {
          name: "Squat",
          orderIndex: 0,
          sets: [
            { setNumber: 1, targetWeight: 132.5 },
            { setNumber: 2, targetWeight: 136 },
            { setNumber: 3, targetWeight: 140 },
            { setNumber: 4, targetWeight: null },
          ],
        },
      ],
    });
    assert.deepEqual(
      plan.items[0].sets.map((s: { targetWeight: number | null }) => s.targetWeight),
      [135, 140, 140, null]
    );
  });

  it("lists plans and gets one by id", async () => {
    const plan = await createPlan({ name: "Listed Plan" });
    const list = await api<Plan[]>("GET", "/api/plans");
    assert.equal(list.status, 200);
    assert.ok(list.body.some((p) => p.id === plan.id));

    const got = await api<PlanDetail>("GET", `/api/plans/${plan.id}`);
    assert.equal(got.status, 200);
    assert.equal(got.body.name, "Listed Plan");
  });

  it("404s an unknown plan", async () => {
    assert.equal((await api("GET", "/api/plans/999999")).status, 404);
    assert.equal((await api("PATCH", "/api/plans/999999", { name: "x" })).status, 404);
    assert.equal((await api("DELETE", "/api/plans/999999")).status, 404);
  });

  it("patches only the fields given, and can clear nullable ones", async () => {
    const plan = await createPlan({ description: "old" });

    const renamed = await api<PlanDetail>("PATCH", `/api/plans/${plan.id}`, { name: "Renamed" });
    assert.equal(renamed.body.name, "Renamed");
    assert.equal(renamed.body.description, "old");
    assert.equal(renamed.body.kind, "upper");

    const cleared = await api<PlanDetail>("PATCH", `/api/plans/${plan.id}`, { description: null });
    assert.equal(cleared.body.name, "Renamed");
    assert.equal(cleared.body.description, null);
  });

  it("deletes a plan and its items", async () => {
    const plan = await createPlan();
    assert.equal((await api("DELETE", `/api/plans/${plan.id}`)).status, 204);
    assert.equal((await api("GET", `/api/plans/${plan.id}`)).status, 404);
  });
});

describe("plan items", () => {
  it("adds, updates, and deletes an item", async () => {
    const plan = await createPlan();

    const added = await api<PlanDetail>("POST", `/api/plans/${plan.id}/items`, {
      name: "Overhead Press",
      orderIndex: 1,
      sets: [{ setNumber: 1, targetReps: 8, targetWeight: 92.5 }],
    });
    assert.equal(added.status, 201);
    assert.deepEqual(added.body.items.map((i) => i.name), ["Bench Press", "Overhead Press"]);
    assert.equal(added.body.items[1].sets[0].targetWeight, 95);

    const ohp = added.body.items[1];
    const updated = await api<PlanDetail>("PATCH", `/api/plans/${plan.id}/items/${ohp.id}`, {
      orderIndex: -1,
      notes: "strict form",
    });
    assert.equal(updated.status, 200);
    assert.deepEqual(updated.body.items.map((i) => i.name), ["Overhead Press", "Bench Press"]);
    assert.equal(updated.body.items[0].notes, "strict form");

    assert.equal((await api("DELETE", `/api/plans/${plan.id}/items/${ohp.id}`)).status, 204);
    const after = await api<PlanDetail>("GET", `/api/plans/${plan.id}`);
    assert.deepEqual(after.body.items.map((i) => i.name), ["Bench Press"]);
  });

  it("404s adding an item to an unknown plan", async () => {
    const res = await api("POST", "/api/plans/999999/items", {
      name: "x",
      orderIndex: 0,
      sets: [],
    });
    assert.equal(res.status, 404);
  });

  it("refuses to touch an item through a different plan's URL", async () => {
    const a = await createPlan({ name: "A" });
    const b = await createPlan({ name: "B" });
    const itemA = a.items[0].id;

    assert.equal((await api("PATCH", `/api/plans/${b.id}/items/${itemA}`, { name: "x" })).status, 404);
    assert.equal((await api("DELETE", `/api/plans/${b.id}/items/${itemA}`)).status, 404);

    const stillThere = await api<PlanDetail>("GET", `/api/plans/${a.id}`);
    assert.equal(stillThere.body.items[0].name, "Bench Press");
  });
});

describe("exercise types", () => {
  it("defaults to weighted", async () => {
    const plan = await createPlan();
    assert.equal(plan.items[0].exerciseType, "weighted");
  });

  it("stores the type on create, add, and update", async () => {
    const plan = await createPlan({
      items: [
        {
          name: "Plank",
          exerciseType: "timed",
          orderIndex: 0,
          sets: [{ setNumber: 1, targetDurationSeconds: 60 }],
        },
      ],
    });
    assert.equal(plan.items[0].exerciseType, "timed");
    assert.equal(plan.items[0].sets[0].targetDurationSeconds, 60);

    const added = await api<PlanDetail>("POST", `/api/plans/${plan.id}/items`, {
      name: "Pull-ups",
      exerciseType: "bodyweight",
      orderIndex: 1,
      sets: [{ setNumber: 1, targetReps: 6, targetWeight: 22 }],
    });
    assert.equal(added.body.items[1].exerciseType, "bodyweight");
    assert.equal(added.body.items[1].sets[0].targetWeight, 25, "added load still rounds up");

    const pullups = added.body.items[1];
    const changed = await api<PlanDetail>("PATCH", `/api/plans/${plan.id}/items/${pullups.id}`, {
      exerciseType: "weighted",
    });
    assert.equal(changed.body.items[1].exerciseType, "weighted");
    assert.equal(changed.body.items[1].name, "Pull-ups");
  });

  it("rejects an unknown type with a 400", async () => {
    const plan = await createPlan();
    const bad = { name: "x", exerciseType: "cardio", orderIndex: 0, sets: [] };
    assert.equal((await api("POST", "/api/plans", { name: "P", items: [bad] })).status, 400);
    assert.equal((await api("POST", `/api/plans/${plan.id}/items`, bad)).status, 400);
    assert.equal(
      (await api("PATCH", `/api/plans/${plan.id}/items/${plan.items[0].id}`, { exerciseType: "cardio" })).status,
      400
    );
  });
});

describe("plan item sets", () => {
  it("adds, updates, and deletes a set", async () => {
    const plan = await createPlan();
    const item = plan.items[0];

    const added = await api<PlanDetail>("POST", `/api/plans/${plan.id}/items/${item.id}/sets`, {
      setNumber: 3,
      targetReps: 3,
      targetWeight: 151,
      targetExtra: { rpe: 8 },
    });
    assert.equal(added.status, 201);
    const set3 = added.body.items[0].sets.find((s) => s.setNumber === 3)!;
    assert.equal(set3.targetWeight, 155);
    assert.deepEqual(set3.targetExtra, { rpe: 8 });

    const setUrl = `/api/plans/${plan.id}/items/${item.id}/sets/${set3.id}`;
    const patched = await api<PlanDetail>("PATCH", setUrl, { targetWeight: 157.5 });
    assert.equal(patched.status, 200);
    const after = patched.body.items[0].sets.find((s) => s.id === set3.id)!;
    assert.equal(after.targetWeight, 160);
    assert.equal(after.targetReps, 3, "unspecified fields are kept");
    assert.deepEqual(after.targetExtra, { rpe: 8 });

    assert.equal((await api("DELETE", setUrl)).status, 204);
    const final = await api<PlanDetail>("GET", `/api/plans/${plan.id}`);
    assert.equal(final.body.items[0].sets.length, 2);
  });

  it("404s a set added to an item from another plan", async () => {
    const a = await createPlan({ name: "A" });
    const b = await createPlan({ name: "B" });
    const res = await api("POST", `/api/plans/${b.id}/items/${a.items[0].id}/sets`, {
      setNumber: 9,
    });
    assert.equal(res.status, 404);
  });

  it("refuses to touch a set through a different plan or item URL", async () => {
    const a = await createPlan({ name: "A" });
    const b = await createPlan({ name: "B" });
    const itemA = a.items[0];
    const setA = itemA.sets[0];

    assert.equal(
      (await api("PATCH", `/api/plans/${b.id}/items/${itemA.id}/sets/${setA.id}`, { targetReps: 1 })).status,
      404
    );
    assert.equal(
      (await api("DELETE", `/api/plans/${b.id}/items/${itemA.id}/sets/${setA.id}`)).status,
      404
    );
    assert.equal(
      (await api("DELETE", `/api/plans/${a.id}/items/${b.items[0].id}/sets/${setA.id}`)).status,
      404
    );

    const stillThere = await api<PlanDetail>("GET", `/api/plans/${a.id}`);
    assert.equal(stillThere.body.items[0].sets.length, 2);
    assert.equal(stillThere.body.items[0].sets[0].targetReps, 5);
  });

  it("404s a missing set", async () => {
    const plan = await createPlan();
    const url = `/api/plans/${plan.id}/items/${plan.items[0].id}/sets/999999`;
    assert.equal((await api("PATCH", url, { targetReps: 1 })).status, 404);
    assert.equal((await api("DELETE", url)).status, 404);
  });
});
