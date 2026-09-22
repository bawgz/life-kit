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

export default function Plans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
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
      items: itemsInput,
    });
    setName("");
    setDescription("");
    setRows([emptyRow()]);
    refresh();
  }

  return (
    <div>
      <h1>Plans</h1>

      <form className="card" onSubmit={handleCreate}>
        <h2>New plan</h2>
        <input placeholder="Name (e.g. Push Day)" value={name} onChange={(e) => setName(e.target.value)} />
        <input
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        {rows.map((row, i) => (
          <div className="template-row" key={i}>
            <input
              placeholder="Item name (e.g. Bench Press)"
              value={row.name}
              onChange={(e) => updateRow(i, { name: e.target.value })}
            />
            <input
              type="number"
              min={1}
              value={row.sets}
              onChange={(e) => updateRow(i, { sets: Number(e.target.value) })}
              title="Sets"
            />
            <input
              placeholder="Target reps"
              value={row.reps}
              onChange={(e) => updateRow(i, { reps: e.target.value })}
            />
            <input
              placeholder="Target weight"
              value={row.weight}
              onChange={(e) => updateRow(i, { weight: e.target.value })}
            />
          </div>
        ))}
        <button type="button" className="link-button" onClick={() => setRows((r) => [...r, emptyRow()])}>
          + Add item
        </button>

        <button type="submit">Create plan</button>
      </form>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <ul className="list">
          {plans.map((p) => (
            <li key={p.id}>
              <Link to={`/plans/${p.id}`}>{p.name}</Link>
              {p.description && <span className="muted"> · {p.description}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
