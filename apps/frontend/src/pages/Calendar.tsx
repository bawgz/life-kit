import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
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

function prettyDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function Calendar() {
  const navigate = useNavigate();
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
    setPlanId("");
    refresh();
  }

  async function setStatus(id: number, status: ScheduledWorkout["status"]) {
    await api.updateScheduledWorkout(id, { status });
    refresh();
  }

  async function startWorkout(w: ScheduledWorkout) {
    const session = await api.createSession({
      scheduledWorkoutId: w.id,
      date: w.scheduledDate,
    });
    navigate(`/sessions/${session.id}`);
  }

  const planName = (id: number | null) => plans.find((p) => p.id === id)?.name ?? "Ad-hoc";

  return (
    <div>
      <div className="page-head">
        <p className="kicker">Schedule</p>
        <h1 className="display">Calendar</h1>
      </div>

      <div className="card">
        <div className="inline-form">
          <div className="field" style={{ marginBottom: 0 }}>
            <span>From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <span>To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      {workouts.length === 0 ? (
        <p className="muted">Nothing scheduled in this range.</p>
      ) : (
        <div className="card">
          <ul className="list-plain">
            {workouts.map((w) => (
              <li className="plan-row" key={w.id}>
                <div>
                  <div style={{ fontWeight: 700 }}>{prettyDate(w.scheduledDate)}</div>
                  <div className="muted mono" style={{ fontSize: "0.82rem" }}>
                    {planName(w.planId)}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
                  <span className={`badge badge-${w.status}`}>{w.status}</span>
                  {w.status === "planned" && (
                    <>
                      <button className="link-button" onClick={() => startWorkout(w)}>
                        Start
                      </button>
                      <button className="link-button" onClick={() => setStatus(w.id, "skipped")}>
                        Skip
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form className="card" onSubmit={handleSchedule}>
        <p className="section-label">Schedule a workout</p>
        <div className="field">
          <span>Plan</span>
          <select value={planId} onChange={(e) => setPlanId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Ad-hoc (no plan)</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <span>Date</span>
          <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary">
          Schedule
        </button>
      </form>

      <p className="muted">
        Browse <Link to="/plans">plans</Link> to create one first if the list above is empty.
      </p>
    </div>
  );
}
