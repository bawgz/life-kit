import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { CreatePlanItemInput, PlanDetail as PlanDetailType } from "@life-kit/shared";
import { api, ApiError } from "../api.js";
import PresetSets from "../components/PresetSets.js";

interface ItemRow {
  name: string;
  sets: number;
  reps: string;
  weight: string;
}

function emptyRow(): ItemRow {
  return { name: "", sets: 3, reps: "", weight: "" };
}

const KIND_LABELS: Record<string, string> = {
  upper: "Upper",
  legs: "Legs",
};

export default function Plans() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<PlanDetailType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<number | null>(null);

  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState("");
  const [rows, setRows] = useState<ItemRow[]>([emptyRow()]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.listPlans();
        const details = await Promise.all(list.map((p) => api.getPlan(p.id)));
        if (!cancelled) setPlans(details);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof ApiError ? e.message : "Failed to load workouts");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function startWorkout(planId: number) {
    setStartingId(planId);
    setError(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const session = await api.createSession({ planId, date: today });
      navigate(`/sessions/${session.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't start workout");
    } finally {
      setStartingId(null);
    }
  }

  function updateRow(index: number, patch: Partial<ItemRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    const itemsInput: CreatePlanItemInput[] = rows
      .filter((r) => r.name.trim() !== "")
      .map((r, orderIndex) => ({
        name: r.name.trim(),
        orderIndex,
        sets: Array.from({ length: Math.max(1, r.sets) }, (_, i) => ({
          setNumber: i + 1,
          targetReps: r.reps ? Number(r.reps) : undefined,
          targetWeight: r.weight ? Number(r.weight) : undefined,
        })),
      }));

    try {
      const created = await api.createPlan({
        name: name.trim(),
        description: description.trim() || null,
        kind: kind || null,
        items: itemsInput,
      });
      setPlans((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setName("");
      setDescription("");
      setKind("");
      setRows([emptyRow()]);
      setShowNew(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't create template");
    }
  }

  return (
    <div>
      <div className="page-head">
        <p className="kicker">Training</p>
        <h1 className="display">Workouts</h1>
        {error && <p className="error">{error}</p>}
      </div>

      {loading ? (
        <p className="muted">Loading...</p>
      ) : plans.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ marginTop: 0 }}>
            No workout templates yet — create your first below.
          </p>
        </div>
      ) : (
        plans.map((plan) => (
          <div className="card exercise-block" key={plan.id}>
            <div className="exercise-head">
              <h2 className="exercise-name">
                <Link to={`/plans/${plan.id}`}>{plan.name}</Link>
              </h2>
              {plan.kind && KIND_LABELS[plan.kind] && (
                <span className="badge badge-lime">{KIND_LABELS[plan.kind]}</span>
              )}
            </div>
            {plan.description && <p className="exercise-note">{plan.description}</p>}
            <PresetSets plan={plan} />
            <div className="button-row">
              <button
                className="btn btn-primary"
                onClick={() => startWorkout(plan.id)}
                disabled={startingId === plan.id}
              >
                {startingId === plan.id ? "Starting..." : "Start workout"}
              </button>
              <Link className="btn" to={`/plans/${plan.id}`}>
                Details
              </Link>
            </div>
          </div>
        ))
      )}

      <div className="card">
        {!showNew ? (
          <button type="button" className="link-button" onClick={() => setShowNew(true)}>
            + New template
          </button>
        ) : (
          <form onSubmit={handleCreate}>
            <p className="section-label">New template</p>
            <div className="field">
              <span>Name</span>
              <input
                placeholder="e.g. Upper A"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="field">
              <span>Type</span>
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="">—</option>
                <option value="upper">Upper body</option>
                <option value="legs">Legs (enables knee check)</option>
              </select>
            </div>
            <div className="field">
              <span>Description</span>
              <input
                placeholder="Optional coaching notes"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {rows.map((row, i) => (
              <div
                className="set-row"
                key={i}
                style={{ gridTemplateColumns: "1fr 3.2rem 1fr 1fr" }}
              >
                <input
                  placeholder="Exercise (e.g. Bench Press)"
                  value={row.name}
                  onChange={(e) => updateRow(i, { name: e.target.value })}
                />
                <input
                  type="number"
                  min={1}
                  value={row.sets}
                  onChange={(e) => updateRow(i, { sets: Number(e.target.value) })}
                  title="Sets"
                  className="mono"
                />
                <input
                  placeholder="Reps"
                  value={row.reps}
                  onChange={(e) => updateRow(i, { reps: e.target.value })}
                  className="mono"
                  inputMode="numeric"
                />
                <input
                  placeholder="Weight"
                  value={row.weight}
                  onChange={(e) => updateRow(i, { weight: e.target.value })}
                  className="mono"
                  inputMode="decimal"
                />
              </div>
            ))}
            <div style={{ margin: "0.6rem 0" }}>
              <button
                type="button"
                className="link-button"
                onClick={() => setRows((r) => [...r, emptyRow()])}
              >
                + Add exercise
              </button>
            </div>

            <div className="button-row">
              <button type="submit" className="btn btn-primary">
                Create template
              </button>
              <button type="button" className="btn" onClick={() => setShowNew(false)}>
                Cancel
              </button>
            </div>
            <p className="muted" style={{ marginBottom: 0 }}>
              Goal weights round up to the nearest 5 — no half weights.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
