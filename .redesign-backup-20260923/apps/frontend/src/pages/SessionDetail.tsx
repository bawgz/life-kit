import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import type { SessionDetail as SessionDetailType } from "@life-kit/shared";
import { api } from "../api.js";

function SetLogForm({
  sessionId,
  sessionItemId,
  nextSetNumber,
  onLogged,
}: {
  sessionId: number;
  sessionItemId: number;
  nextSetNumber: number;
  onLogged: (session: SessionDetailType) => void;
}) {
  const [reps, setReps] = useState("");
  const [weight, setWeight] = useState("");
  const [durationSeconds, setDurationSeconds] = useState("");
  const [distanceMeters, setDistanceMeters] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const updated = await api.logSet(sessionId, sessionItemId, {
      setNumber: nextSetNumber,
      reps: reps ? Number(reps) : undefined,
      weight: weight ? Number(weight) : undefined,
      durationSeconds: durationSeconds ? Number(durationSeconds) : undefined,
      distanceMeters: distanceMeters ? Number(distanceMeters) : undefined,
    });
    onLogged(updated);
    setReps("");
    setWeight("");
    setDurationSeconds("");
    setDistanceMeters("");
  }

  return (
    <form className="inline-form" onSubmit={handleSubmit}>
      <span className="muted">Set {nextSetNumber}:</span>
      <input placeholder="Reps" value={reps} onChange={(e) => setReps(e.target.value)} />
      <input placeholder="Weight" value={weight} onChange={(e) => setWeight(e.target.value)} />
      <input
        placeholder="Duration (s)"
        value={durationSeconds}
        onChange={(e) => setDurationSeconds(e.target.value)}
      />
      <input
        placeholder="Distance (m)"
        value={distanceMeters}
        onChange={(e) => setDistanceMeters(e.target.value)}
      />
      <button type="submit">Log set</button>
    </form>
  );
}

export default function SessionDetail() {
  const { id } = useParams();
  const sessionId = Number(id);
  const [session, setSession] = useState<SessionDetailType | null>(null);
  const [newItemName, setNewItemName] = useState("");

  function refresh() {
    api.getSession(sessionId).then(setSession);
  }

  useEffect(refresh, [sessionId]);

  async function handleAddItem(e: FormEvent) {
    e.preventDefault();
    if (!newItemName.trim()) return;
    const orderIndex = session?.items.length ?? 0;
    const updated = await api.addSessionItem(sessionId, {
      name: newItemName.trim(),
      orderIndex,
    });
    setSession(updated);
    setNewItemName("");
  }

  if (!session) return <p>Loading...</p>;

  return (
    <div>
      <h1>Session — {session.date}</h1>

      {session.items.map((item) => (
        <div className="card" key={item.id}>
          <h2>{item.name}</h2>
          <ul className="list">
            {item.sets.map((s) => (
              <li key={s.id} className="muted">
                Set {s.setNumber}: {s.reps ?? "-"} reps
                {s.weight != null && ` @ ${s.weight}`}
                {s.durationSeconds != null && ` · ${s.durationSeconds}s`}
                {s.distanceMeters != null && ` · ${s.distanceMeters}m`}
              </li>
            ))}
          </ul>
          <SetLogForm
            sessionId={sessionId}
            sessionItemId={item.id}
            nextSetNumber={item.sets.length + 1}
            onLogged={setSession}
          />
        </div>
      ))}

      <form className="inline-form" onSubmit={handleAddItem}>
        <input
          placeholder="Item name (e.g. Bench Press)"
          value={newItemName}
          onChange={(e) => setNewItemName(e.target.value)}
        />
        <button type="submit">Add to session</button>
      </form>
    </div>
  );
}
