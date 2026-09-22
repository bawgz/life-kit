import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Session } from "@life-kit/shared";
import { api } from "../api.js";

export default function Sessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    api.listSessions().then(setSessions);
  }, []);

  async function startAdHoc() {
    const today = new Date().toISOString().slice(0, 10);
    const session = await api.createSession({ date: today });
    navigate(`/sessions/${session.id}`);
  }

  return (
    <div>
      <h1>Sessions</h1>
      <button onClick={startAdHoc}>Start ad-hoc session (today)</button>

      <ul className="list">
        {sessions.map((s) => (
          <li key={s.id}>
            <Link to={`/sessions/${s.id}`}>{s.date}</Link>
            {s.completedAt && <span className="badge badge-completed"> completed</span>}
          </li>
        ))}
        {sessions.length === 0 && <p className="muted">No sessions logged yet.</p>}
      </ul>
    </div>
  );
}
