import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { CreatePlanItemInput, PlanDetail as PlanDetailType } from "@life-kit/shared";
import { api, ApiError } from "../api.js";
import PresetSets from "../components/PresetSets.js";
import {
  ExerciseDraftFields,
  draftToItem,
  emptyDraft,
  type ExerciseDraft,
} from "../components/ExerciseFields.js";

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
  const [rows, setRows] = useState<ExerciseDraft[]>([emptyDraft()]);

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

  function updateRow(index: number, patch: Partial<ExerciseDraft>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    const itemsInput: CreatePlanItemInput[] = [];
    for (const row of rows.filter((r) => r.name.trim() !== "")) {
      const item = draftToItem(row, itemsInput.length);
      if (typeof item === "string") {
        setError(item);
        return;
      }
      itemsInput.push(item);
    }

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
      setRows([emptyDraft()]);
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
              <ExerciseDraftFields key={i} draft={row} onChange={(patch) => updateRow(i, patch)} />
            ))}
            <div style={{ margin: "0.6rem 0" }}>
              <button
                type="button"
                className="link-button"
                onClick={() => setRows((r) => [...r, emptyDraft()])}
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
