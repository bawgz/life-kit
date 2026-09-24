import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { PlanDetail as PlanDetailType, PlanItemSet } from "@life-kit/shared";
import { api } from "../api.js";

function targetSummary(sets: PlanItemSet[]): string {
  if (sets.length === 0) return "No target sets";
  const first = sets[0];
  const same = sets.every(
    (s) =>
      s.targetReps === first.targetReps &&
      s.targetWeight === first.targetWeight &&
      s.targetDurationSeconds === first.targetDurationSeconds &&
      s.targetDistanceMeters === first.targetDistanceMeters
  );
  const fmt = (s: PlanItemSet) => {
    const bits: string[] = [];
    if (s.targetWeight != null) bits.push(`${s.targetWeight}`);
    if (s.targetReps != null) bits.push(`×${s.targetReps}`);
    if (s.targetDurationSeconds != null) bits.push(`${s.targetDurationSeconds}s`);
    if (s.targetDistanceMeters != null) bits.push(`${s.targetDistanceMeters}m`);
    return bits.join(" ") || "—";
  };
  return same ? `${sets.length} × ${fmt(first)}` : sets.map(fmt).join(" · ");
}

export default function PlanDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<PlanDetailType | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    api.getPlan(Number(id)).then(setPlan);
  }, [id]);

  async function startSession() {
    if (!plan) return;
    setStarting(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const session = await api.createSession({ planId: plan.id, date: today });
      navigate(`/sessions/${session.id}`);
    } finally {
      setStarting(false);
    }
  }

  if (!plan) return <p className="muted">Loading...</p>;

  return (
    <div>
      <div className="page-head">
        <p className="kicker">Template</p>
        <h1 className="display">{plan.name}</h1>
      </div>

      <div className="card">
        {plan.description && <p className="muted" style={{ marginTop: 0 }}>{plan.description}</p>}
        {plan.kind && <span className="badge badge-lime">{plan.kind}</span>}
        <div className="button-row">
          <button className="btn btn-primary" onClick={startSession} disabled={starting}>
            {starting ? "Starting..." : "Start workout"}
          </button>
        </div>
      </div>

      <p className="section-label">Exercises</p>
      <div className="card">
        <ul className="list-plain">
          {plan.items.map((item) => (
            <li key={item.id} style={{ marginBottom: "0.9rem" }}>
              <div style={{ fontWeight: 700 }}>{item.name}</div>
              {item.notes && <div className="muted">{item.notes}</div>}
              <p className="target-line">{targetSummary(item.sets)}</p>
            </li>
          ))}
          {plan.items.length === 0 && <p className="muted">No exercises in this plan yet.</p>}
        </ul>
      </div>
    </div>
  );
}
