import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { Plan, ScheduledWorkout } from "@life-kit/shared";
import { api } from "../api.js";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfWeek(): Date {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d;
}

export default function Calendar() {
  const [from, setFrom] = useState(isoDate(startOfWeek()));
  const [to, setTo] = useState(() => {
    const d = startOfWeek();
    d.setDate(d.getDate() + 13);
    return isoDate(d);
  });
  const [workouts, setWorkouts] = useState<ScheduledWorkout[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planId, setPlanId] = useState<number | "">("");
  const [scheduledDate, setScheduledDate] = useState(isoDate(new Date()));

  function refresh() {
    api.listScheduledWorkouts(from, to).then(setWorkouts);
  }

  useEffect(refresh, [from, to]);
  useEffect(() => {
    api.listPlans().then(setPlans);
  }, []);

  async function handleSchedule(e: FormEvent) {
    e.preventDefault();
    await api.createScheduledWorkout({
      planId: planId === "" ? null : planId,
      scheduledDate,
    });
    refresh();
  }

  async function setStatus(id: number, status: ScheduledWorkout["status"]) {
    await api.updateScheduledWorkout(id, { status });
    refresh();
  }

  const planName = (id: number | null) => plans.find((p) => p.id === id)?.name ?? "Ad-hoc";

  return (
    <div>
      <h1>Calendar</h1>

      <div className="inline-form">
        <label>
          From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      <ul className="list">
        {workouts.map((w) => (
          <li key={w.id}>
            <strong>{w.scheduledDate}</strong> — {planName(w.planId)}{" "}
            <span className={`badge badge-${w.status}`}>{w.status}</span>{" "}
            {w.status === "planned" && (
              <>
                <button className="link-button" onClick={() => setStatus(w.id, "skipped")}>
                  Skip
                </button>
              </>
            )}
          </li>
        ))}
        {workouts.length === 0 && <p className="muted">Nothing scheduled in this range.</p>}
      </ul>

      <form className="card" onSubmit={handleSchedule}>
        <h2>Schedule a workout</h2>
        <select value={planId} onChange={(e) => setPlanId(e.target.value ? Number(e.target.value) : "")}>
          <option value="">Ad-hoc (no plan)</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
        <button type="submit">Schedule</button>
      </form>

      <p className="muted">
        Browse <Link to="/plans">plans</Link> to create one first if the list above is empty.
      </p>
    </div>
  );
}
