import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type {
  PlanDetail as PlanDetailType,
  PlanItem as PlanItemType,
  PlanItemSet as PlanItemSetType,
} from "@life-kit/shared";
import { api, ApiError } from "../api.js";
import PresetSets from "../components/PresetSets.js";

function parseNum(raw: string): number | null | "invalid" {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : "invalid";
}

function errMsg(e: unknown): string {
  return e instanceof ApiError ? e.message : "Something went wrong";
}

/* ---------------- edit-mode row for one preset set ---------------- */

function EditSetRow({
  planId,
  item,
  set,
  tick,
  onChanged,
  onError,
}: {
  planId: number;
  item: PlanItemType;
  set: PlanItemSetType;
  tick: number;
  onChanged: (p: PlanDetailType) => void;
  onError: (m: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);

  async function save(field: "targetWeight" | "targetReps", raw: string) {
    const v = parseNum(raw);
    if (v === "invalid") {
      onError("Numbers only in weight / reps.");
      return;
    }
    const current = field === "targetWeight" ? set.targetWeight : set.targetReps;
    if (v === current) return;
    try {
      const updated = await api.updatePlanItemSet(planId, item.id, set.id, { [field]: v });
      onChanged(updated);
    } catch (e) {
      onError(errMsg(e));
    }
  }

  async function remove() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    try {
      await api.deletePlanItemSet(planId, item.id, set.id);
      const updated = await api.getPlan(planId);
      onChanged(updated);
    } catch (e) {
      onError(errMsg(e));
    }
  }

  return (
    <div className="set-row" key={`${set.id}-${tick}`}>
      <span className="set-num">{set.setNumber}</span>
      <input
        className="mono"
        inputMode="decimal"
        placeholder="lbs"
        aria-label={`${item.name} set ${set.setNumber} goal weight`}
        defaultValue={set.targetWeight != null ? String(set.targetWeight) : ""}
        onBlur={(e) => save("targetWeight", e.target.value)}
      />
      <input
        className="mono"
        inputMode="numeric"
        placeholder="reps"
        aria-label={`${item.name} set ${set.setNumber} goal reps`}
        defaultValue={set.targetReps != null ? String(set.targetReps) : ""}
        onBlur={(e) => save("targetReps", e.target.value)}
      />
      <span />
      <button
        type="button"
        className={confirming ? "set-remove confirm" : "set-remove"}
        aria-label={confirming ? "Confirm remove set" : "Remove set"}
        onClick={remove}
        onBlur={() => setConfirming(false)}
      >
        {confirming ? "Sure?" : "×"}
      </button>
    </div>
  );
}

/* ---------------- edit-mode block for one exercise ---------------- */

function EditItem({
  planId,
  item,
  tick,
  onChanged,
  onError,
}: {
  planId: number;
  item: PlanItemType & { sets: PlanItemSetType[] };
  tick: number;
  onChanged: (p: PlanDetailType) => void;
  onError: (m: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);

  async function saveItem(patch: { name?: string; notes?: string | null }) {
    try {
      const updated = await api.updatePlanItem(planId, item.id, patch);
      onChanged(updated);
    } catch (e) {
      onError(errMsg(e));
    }
  }

  async function addSet() {
    const next = item.sets.reduce((m, s) => Math.max(m, s.setNumber), 0) + 1;
    const last = item.sets[item.sets.length - 1];
    try {
      const updated = await api.addPlanItemSet(planId, item.id, {
        setNumber: next,
        targetReps: last?.targetReps ?? null,
        targetWeight: last?.targetWeight ?? null,
      });
      onChanged(updated);
    } catch (e) {
      onError(errMsg(e));
    }
  }

  async function removeItem() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    try {
      await api.deletePlanItem(planId, item.id);
      const updated = await api.getPlan(planId);
      onChanged(updated);
    } catch (e) {
      onError(errMsg(e));
    }
  }

  return (
    <div className="card exercise-block">
      <div className="field" style={{ marginBottom: "0.4rem" }}>
        <span>Exercise</span>
        <input
          key={`name-${item.id}-${tick}`}
          defaultValue={item.name}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== item.name) saveItem({ name: v });
          }}
        />
      </div>
      <div className="field">
        <span>Notes</span>
        <input
          key={`notes-${item.id}-${tick}`}
          defaultValue={item.notes ?? ""}
          placeholder="e.g. per side"
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v !== (item.notes ?? "")) saveItem({ notes: v || null });
          }}
        />
      </div>

      {item.sets.map((s) => (
        <EditSetRow
          key={s.id}
          planId={planId}
          item={item}
          set={s}
          tick={tick}
          onChanged={onChanged}
          onError={onError}
        />
      ))}

      <div className="add-set-row">
        <button type="button" className="link-button" onClick={addSet}>
          + Add set
        </button>
      </div>
      <div style={{ marginTop: "0.6rem" }}>
        <button
          type="button"
          className={`link-button${confirming ? " danger" : ""}`}
          onClick={removeItem}
          onBlur={() => setConfirming(false)}
        >
          {confirming ? "Confirm remove exercise" : "Remove exercise"}
        </button>
      </div>
    </div>
  );
}

/* ---------------- page ---------------- */

export default function PlanDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const planId = Number(id);

  const [plan, setPlan] = useState<PlanDetailType | null>(null);
  const [editing, setEditing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tick, setTick] = useState(0);

  const [newName, setNewName] = useState("");
  const [newSets, setNewSets] = useState(3);
  const [newReps, setNewReps] = useState("");
  const [newWeight, setNewWeight] = useState("");

  useEffect(() => {
    api
      .getPlan(planId)
      .then(setPlan)
      .catch((e) => setError(errMsg(e)));
  }, [planId]);

  function refresh(p: PlanDetailType) {
    setPlan(p);
    setTick((t) => t + 1);
  }

  async function startSession() {
    if (!plan) return;
    setStarting(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const session = await api.createSession({ planId: plan.id, date: today });
      navigate(`/sessions/${session.id}`);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setStarting(false);
    }
  }

  async function addExercise(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const reps = parseNum(newReps);
    const weight = parseNum(newWeight);
    if (reps === "invalid" || weight === "invalid") {
      setError("Numbers only in reps / weight.");
      return;
    }
    try {
      const updated = await api.addPlanItem(planId, {
        name: newName.trim(),
        orderIndex: plan?.items.length ?? 0,
        sets: Array.from({ length: Math.max(1, newSets) }, (_, i) => ({
          setNumber: i + 1,
          targetReps: reps,
          targetWeight: weight,
        })),
      });
      refresh(updated);
      setNewName("");
      setNewReps("");
      setNewWeight("");
      setNewSets(3);
    } catch (err) {
      setError(errMsg(err));
    }
  }

  async function deletePlan() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      await api.deletePlan(planId);
      navigate("/");
    } catch (e) {
      setError(errMsg(e));
    }
  }

  if (!plan) {
    return (
      <div>
        <p className="kicker">Template</p>
        {error ? <p className="error">{error}</p> : <p className="muted">Loading...</p>}
      </div>
    );
  }

  return (
    <div>
      <div className="page-head">
        <p className="kicker">Template</p>
        <h1 className="display">{plan.name}</h1>
        {error && <p className="error">{error}</p>}
      </div>

      <div className="card">
        {plan.description && (
          <p className="muted" style={{ marginTop: 0 }}>{plan.description}</p>
        )}
        {plan.kind && <span className="badge badge-lime">{plan.kind}</span>}
        <div className="button-row">
          {!editing && (
            <button
              className="btn btn-primary"
              onClick={startSession}
              disabled={starting}
            >
              {starting ? "Starting..." : "Start workout"}
            </button>
          )}
          <button className="btn" onClick={() => setEditing((v) => !v)}>
            {editing ? "Done editing" : "Edit template"}
          </button>
        </div>
      </div>

      <p className="section-label">Preset — {plan.items.length} exercises</p>

      {!editing ? (
        <div className="card">
          <PresetSets plan={plan} />
        </div>
      ) : (
        <>
          {plan.items.map((item) => (
            <EditItem
              key={`${item.id}-${tick}`}
              planId={planId}
              item={item}
              tick={tick}
              onChanged={refresh}
              onError={setError}
            />
          ))}

          <form className="card" onSubmit={addExercise}>
            <p className="section-label">Add exercise</p>
            <div
              className="set-row"
              style={{ gridTemplateColumns: "1fr 3.2rem 1fr 1fr" }}
            >
              <input
                placeholder="Exercise (e.g. Bench Press)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <input
                type="number"
                min={1}
                value={newSets}
                onChange={(e) => setNewSets(Number(e.target.value))}
                title="Sets"
                className="mono"
              />
              <input
                placeholder="Reps"
                value={newReps}
                onChange={(e) => setNewReps(e.target.value)}
                className="mono"
                inputMode="numeric"
              />
              <input
                placeholder="Weight"
                value={newWeight}
                onChange={(e) => setNewWeight(e.target.value)}
                className="mono"
                inputMode="decimal"
              />
            </div>
            <div style={{ marginTop: "0.6rem" }}>
              <button type="submit" className="btn btn-small">
                Add
              </button>
            </div>
            <p className="muted" style={{ marginBottom: 0 }}>
              Goal weights round up to the nearest 5 — no half weights.
            </p>
          </form>

          <div className="button-row">
            <button
              className={`btn ${confirmDelete ? "btn-danger" : ""}`}
              onClick={deletePlan}
              onBlur={() => setConfirmDelete(false)}
            >
              {confirmDelete ? "Confirm delete template" : "Delete template"}
            </button>
          </div>
        </>
      )}

      <p style={{ marginTop: "1rem" }}>
        <Link to="/" className="link-button">
          ← All workouts
        </Link>
      </p>
    </div>
  );
}
