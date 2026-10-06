// Drives every tool end-to-end over real HTTP (client → MCP → backend), so
// transport bugs like a bad header on bodiless DELETEs fail here.
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { call, callExpectingError, teardown } from "./helpers.js";

after(teardown);

async function newPlan(name = "Push Day") {
  return call("create_plan", {
    name,
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
  });
}

describe("plan tools", () => {
  it("creates, reads, lists, updates, and deletes a plan", async () => {
    const plan = await newPlan("Tool Plan");
    assert.equal(plan.items[0].sets.length, 2);

    assert.equal((await call("get_plan", { planId: plan.id })).name, "Tool Plan");
    assert.ok((await call("list_plans")).some((p: { id: number }) => p.id === plan.id));

    const updated = await call("update_plan", { planId: plan.id, description: "desc" });
    assert.equal(updated.description, "desc");
    assert.equal(updated.name, "Tool Plan");

    assert.deepEqual(await call("delete_plan", { planId: plan.id }), {
      ok: true,
      deletedPlanId: plan.id,
    });
    await callExpectingError("get_plan", { planId: plan.id });
  });

  it("appends a new exercise when orderIndex is omitted", async () => {
    const plan = await newPlan();
    const withTwo = await call("add_plan_item", {
      planId: plan.id,
      name: "Dips",
      sets: [{ setNumber: 1, targetReps: 10 }],
    });
    const withThree = await call("add_plan_item", {
      planId: plan.id,
      name: "Flys",
      sets: [{ setNumber: 1, targetReps: 12, targetWeight: 22 }],
    });
    assert.deepEqual(
      withThree.items.map((i: { name: string; orderIndex: number }) => [i.name, i.orderIndex]),
      [
        ["Bench Press", 0],
        ["Dips", 1],
        ["Flys", 2],
      ]
    );
    assert.equal(withTwo.items.length, 2);
    assert.equal(withThree.items[2].sets[0].targetWeight, 25, "goal weight rounds up to 5");
  });

  it("updates and removes an exercise", async () => {
    const plan = await newPlan();
    const item = plan.items[0];

    const renamed = await call("update_plan_item", {
      planId: plan.id,
      planItemId: item.id,
      name: "Incline Bench",
      notes: "30 degrees",
    });
    assert.equal(renamed.items[0].name, "Incline Bench");
    assert.equal(renamed.items[0].notes, "30 degrees");

    const after = await call("delete_plan_item", { planId: plan.id, planItemId: item.id });
    assert.deepEqual(after.items, [], "returns the updated plan");
  });

  it("adds, updates, and removes a target set", async () => {
    const plan = await newPlan();
    const item = plan.items[0];

    const added = await call("add_plan_item_set", {
      planId: plan.id,
      planItemId: item.id,
      setNumber: 3,
      targetReps: 3,
      targetWeight: 141,
    });
    const set3 = added.items[0].sets.find((s: { setNumber: number }) => s.setNumber === 3);
    assert.equal(set3.targetWeight, 145);

    const updated = await call("update_plan_item_set", {
      planId: plan.id,
      planItemId: item.id,
      planItemSetId: set3.id,
      targetReps: 2,
      targetExtra: { rpe: 9 },
    });
    const after = updated.items[0].sets.find((s: { id: number }) => s.id === set3.id);
    assert.equal(after.targetReps, 2);
    assert.equal(after.targetWeight, 145);
    assert.deepEqual(after.targetExtra, { rpe: 9 });

    const removed = await call("delete_plan_item_set", {
      planId: plan.id,
      planItemId: item.id,
      planItemSetId: set3.id,
    });
    assert.equal(removed.items[0].sets.length, 2, "returns the updated plan");
  });

  it("surfaces backend errors to the agent instead of pretending success", async () => {
    const a = await newPlan("A");
    const b = await newPlan("B");
    const text = await callExpectingError("delete_plan_item", {
      planId: b.id,
      planItemId: a.items[0].id,
    });
    assert.match(text, /404/);
    await callExpectingError("delete_plan", { planId: 999999 });
    assert.equal((await call("get_plan", { planId: a.id })).items.length, 1);
  });
});

describe("calendar tools", () => {
  it("schedules, lists, updates, and deletes a workout", async () => {
    const plan = await newPlan();
    const scheduled = await call("schedule_workout", {
      planId: plan.id,
      scheduledDate: "2040-01-01",
    });
    assert.equal(scheduled.status, "planned");

    const listed = await call("list_scheduled_workouts", { from: "2040-01-01", to: "2040-01-01" });
    assert.deepEqual(listed.map((w: { id: number }) => w.id), [scheduled.id]);

    const moved = await call("update_scheduled_workout", {
      scheduledWorkoutId: scheduled.id,
      scheduledDate: "2040-01-02",
      status: "skipped",
    });
    assert.equal(moved.scheduledDate, "2040-01-02");
    assert.equal(moved.status, "skipped");

    await call("delete_scheduled_workout", { scheduledWorkoutId: scheduled.id });
    assert.deepEqual(
      await call("list_scheduled_workouts", { from: "2040-01-01", to: "2040-01-31" }),
      []
    );
  });
});

describe("session tools", () => {
  it("runs a full workout from a scheduled plan", async () => {
    const plan = await newPlan();
    const scheduled = await call("schedule_workout", {
      planId: plan.id,
      scheduledDate: "2041-05-05",
    });

    const session = await call("start_session", {
      scheduledWorkoutId: scheduled.id,
      date: "2041-05-05",
    });
    assert.equal(session.planName, "Push Day");
    const item = session.items[0];

    const logged = await call("log_set", {
      sessionId: session.id,
      sessionItemId: item.id,
      setNumber: 1,
      reps: 5,
      weight: 135,
    });
    assert.equal(logged.items[0].sets.length, 2, "fills the plan's placeholder");
    const set1 = logged.items[0].sets[0];
    assert.equal(set1.reps, 5);

    const fixed = await call("update_session_set", {
      sessionId: session.id,
      sessionItemId: item.id,
      sessionItemSetId: set1.id,
      reps: 4,
    });
    assert.equal(fixed.items[0].sets[0].reps, 4);

    const trimmed = await call("delete_session_set", {
      sessionId: session.id,
      sessionItemId: item.id,
      sessionItemSetId: logged.items[0].sets[1].id,
    });
    assert.equal(trimmed.items[0].sets.length, 1, "returns the updated session");

    const extra = await call("add_session_item", {
      sessionId: session.id,
      name: "Push-ups",
      orderIndex: 1,
    });
    const pushups = extra.items.find((i: { name: string }) => i.name === "Push-ups");
    const without = await call("delete_session_item", {
      sessionId: session.id,
      sessionItemId: pushups.id,
    });
    assert.deepEqual(without.items.map((i: { name: string }) => i.name), ["Bench Press"]);

    const done = await call("update_session", {
      sessionId: session.id,
      completedAt: "2041-05-05T19:00:00.000Z",
      painAfter: 1,
    });
    assert.equal(done.completedAt, "2041-05-05T19:00:00.000Z");
    assert.equal(done.painAfter, 1);

    assert.equal((await call("get_session", { sessionId: session.id })).items.length, 1);
    const history = await call("list_sessions", { from: "2041-05-05", to: "2041-05-05" });
    assert.deepEqual(history.map((s: { id: number }) => s.id), [session.id]);

    await call("delete_session", { sessionId: session.id });
    await callExpectingError("get_session", { sessionId: session.id });
  });
});
