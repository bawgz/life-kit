import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { PlanDetail as PlanDetailType } from "@life-kit/shared";
import { api } from "../api.js";

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
    const today = new Date().toISOString().slice(0, 10);
    const session = await api.createSession({ planId: plan.id, date: today });
    navigate(`/sessions/${session.id}`);
  }

  if (!plan) return <p>Loading...</p>;

  return (
    <div>
      <h1>{plan.name}</h1>
      {plan.description && <p className="muted">{plan.description}</p>}

      <button onClick={startSession} disabled={starting}>
        {starting ? "Starting..." : "Start session from this plan"}
      </button>

      <ul className="list">
        {plan.items.map((item) => (
          <li key={item.id}>
            <strong>{item.name}</strong>
            <ul>
              {item.sets.map((s) => (
                <li key={s.id} className="muted">
                  Set {s.setNumber}: {s.targetReps ?? "-"} reps @ {s.targetWeight ?? "-"}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
