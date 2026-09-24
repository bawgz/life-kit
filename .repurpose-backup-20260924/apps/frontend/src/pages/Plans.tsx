import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { CreatePlanItemInput, Plan } from "@life-kit/shared";
import { api } from "../api.js";

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
  const [plans, setPlans] = useState<Plan[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState("");
  const [rows, setRows] = useState<ItemRow[]>([emptyRow()]);
  const [loading, setLoading] = useState(true);

  function refresh() {
    api.listPlans().then((p) => {
      setPlans(p);
      setLoading(false);
    });
  }

  useEffect(refresh, []);

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
        sets: Array.from({ length: r.sets }, (_, i) => ({
          setNumber: i + 1,
          targetReps: r.reps ? Number(r.reps) : undefined,
          targetWeight: r.weight ? Number(r.weight) : undefined,
        })),
      }));

    await api.createPlan({
      name: name.trim(),
      description: description.trim() || null,
      kind: kind || null,
      items: itemsInput,
    });
    setName("");
    setDescription("");
    setKind("");
    setRows([emptyRow()]);
    refresh();
  }

  return (
    <div>
      <div className="page-head">
        <p className="kicker">Templates</p>
        <h1 className="display">Plans</h1>
      </div>

      <form className="card" onSubmit={handleCreate}>
        <p className="section-label">New plan</p>
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
          <div className="set-row" key={i} style={{ gridTemplateColumns: "1fr 3.2rem 1fr 1fr" }}>
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
          <button type="button" className="link-button" onClick={() => setRows((r) => [...r, emptyRow()])}>
            + Add exercise
          </button>
        </div>

        <button type="submit" className="btn btn-primary">
          Create plan
        </button>
      </form>

      <p className="section-label">Saved plans</p>
      {loading ? (
        <p className="muted">Loading...</p>
      ) : plans.length === 0 ? (
        <p className="muted">No plans yet — create your first template above.</p>
      ) : (
        <div className="card">
          <ul className="list-plain">
            {plans.map((p) => (
              <li className="plan-row" key={p.id}>
                <div>
                  <Link to={`/plans/${p.id}`}>{p.name}</Link>
                  {p.description && <div className="muted">{p.description}</div>}
                </div>
                {p.kind && KIND_LABELS[p.kind] && (
                  <span className="badge badge-lime">{KIND_LABELS[p.kind]}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
