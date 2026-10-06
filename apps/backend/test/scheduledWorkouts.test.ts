import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import type { ScheduledWorkout } from "@life-kit/shared";
import { api, closeApp, createPlan } from "./helpers.js";

after(closeApp);

describe("scheduled workouts", () => {
  it("requires a date", async () => {
    const res = await api("POST", "/api/scheduled-workouts", {});
    assert.equal(res.status, 400);
  });

  it("schedules a plan as 'planned' by default", async () => {
    const plan = await createPlan();
    const res = await api<ScheduledWorkout>("POST", "/api/scheduled-workouts", {
      planId: plan.id,
      scheduledDate: "2030-01-10",
      notes: "heavy",
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.planId, plan.id);
    assert.equal(res.body.status, "planned");
    assert.equal(res.body.notes, "heavy");
  });

  it("schedules an ad-hoc day with no plan", async () => {
    const res = await api<ScheduledWorkout>("POST", "/api/scheduled-workouts", {
      scheduledDate: "2030-01-11",
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.planId, null);
  });

  it("filters by an inclusive date range, oldest first", async () => {
    for (const d of ["2031-03-01", "2031-03-15", "2031-03-31", "2031-04-01"]) {
      await api("POST", "/api/scheduled-workouts", { scheduledDate: d });
    }
    const res = await api<ScheduledWorkout[]>(
      "GET",
      "/api/scheduled-workouts?from=2031-03-01&to=2031-03-31"
    );
    assert.deepEqual(
      res.body.map((w) => w.scheduledDate),
      ["2031-03-01", "2031-03-15", "2031-03-31"]
    );
  });

  it("reschedules and marks status, keeping other fields", async () => {
    const created = await api<ScheduledWorkout>("POST", "/api/scheduled-workouts", {
      scheduledDate: "2030-02-01",
      notes: "keep me",
    });
    const id = created.body.id;

    const moved = await api<ScheduledWorkout>("PATCH", `/api/scheduled-workouts/${id}`, {
      scheduledDate: "2030-02-03",
    });
    assert.equal(moved.body.scheduledDate, "2030-02-03");
    assert.equal(moved.body.notes, "keep me");

    const skipped = await api<ScheduledWorkout>("PATCH", `/api/scheduled-workouts/${id}`, {
      status: "skipped",
    });
    assert.equal(skipped.body.status, "skipped");
    assert.equal(skipped.body.scheduledDate, "2030-02-03");
  });

  it("deletes, and 404s unknown ids", async () => {
    const created = await api<ScheduledWorkout>("POST", "/api/scheduled-workouts", {
      scheduledDate: "2030-02-05",
    });
    const url = `/api/scheduled-workouts/${created.body.id}`;
    assert.equal((await api("DELETE", url)).status, 204);
    assert.equal((await api("DELETE", url)).status, 404);
    assert.equal((await api("PATCH", url, { status: "completed" })).status, 404);
  });

  it("keeps a scheduled workout when its plan is deleted, unlinked", async () => {
    const plan = await createPlan();
    const created = await api<ScheduledWorkout>("POST", "/api/scheduled-workouts", {
      planId: plan.id,
      scheduledDate: "2032-05-05",
    });
    await api("DELETE", `/api/plans/${plan.id}`);

    const list = await api<ScheduledWorkout[]>(
      "GET",
      "/api/scheduled-workouts?from=2032-05-05&to=2032-05-05"
    );
    const kept = list.body.find((w) => w.id === created.body.id);
    assert.ok(kept);
    assert.equal(kept.planId, null);
  });
});
