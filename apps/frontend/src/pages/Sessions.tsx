import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Session, SessionDetail as SessionDetailType } from "@life-kit/shared";
import { ApiError, api } from "../api.js";

function prettyDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function fmtSet(s: { weight: number | null; reps: number | null }): string {
  return `${s.weight ?? "–"}×${s.reps ?? "–"}`;
}

function PainDot({ label, value }: { label: string; value: number | null }) {
  return (
    <span
      className="pain-dots"
      title={`${label}: ${value == null ? "not recorded" : `${value}/10`}`}
    >
      {label}{" "}
      {value == null ? (
        <span className="pain-dot" />
      ) : (
        <span className={`pain-dot${value > 3 ? " over" : value > 0 ? " some" : ""}`} />
      )}
      {value != null ? value : ""}
    </span>
  );
}

function HistoryCard({ session, refresh }: { session: Session; refresh: () => void }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<SessionDetailType | null>(null);
  const [nextMorning, setNextMorning] = useState("");
  const [editingSet, setEditingSet] = useState<number | null>(null);
  const [editWeight, setEditWeight] = useState("");
  const [editReps, setEditReps] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !detail) {
      try {
        const d = await api.getSession(session.id);
        setDetail(d);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Failed to load");
      }
    }
  }

  async function updateDetail(promise: Promise<SessionDetailType>) {
    try {
      setError(null);
      const d = await promise;
      setDetail(d);
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save");
    }
  }

  async function saveNextMorning() {
    const v = nextMorning.trim() === "" ? null : Number(nextMorning);
    if (v !== null && (!Number.isFinite(v) || v < 0 || v > 10)) {
      setError("Pain must be 0–10.");
      return;
    }
    await updateDetail(api.updateSession(session.id, { painNextMorning: v }));
    setNextMorning("");
  }

  function startEditSet(set: { id: number; weight: number | null; reps: number | null }) {
    setEditingSet(set.id);
    setEditWeight(set.weight != null ? String(set.weight) : "");
    setEditReps(set.reps != null ? String(set.reps) : "");
  }

  async function saveEditSet(sessionItemId: number, setId: number) {
    const w = editWeight.trim() === "" ? null : Number(editWeight);
    const r = editReps.trim() === "" ? null : Number(editReps);
    if ((w !== null && !Number.isFinite(w)) || (r !== null && !Number.isFinite(r))) {
      setError("Numbers only in weight / reps.");
      return;
    }
    setEditingSet(null);
    await updateDetail(api.updateSet(session.id, sessionItemId, setId, { weight: w, reps: r }));
  }

  async function deleteSelf() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      await api.deleteSession(session.id);
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to delete");
    }
  }

  return (
    <div className="history-card">
      <button type="button" className="history-summary" onClick={toggle} aria-expanded={open}>
        <span className="history-date">{prettyDate(session.date)}</span>
        <span className="history-meta">
          {session.planName ?? "Ad-hoc workout"}
          {session.notes ? ` — ${session.notes.slice(0, 48)}` : ""}
        </span>
        <span aria-hidden>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="history-detail">
          {error && <p className="error">{error}</p>}
          {!detail ? (
            <p className="muted">Loading...</p>
          ) : (
            <>
              {detail.items.map((item) => (
                <div key={item.id}>
                  <p className="history-exercise">{item.name}</p>
                  <p className="history-sets">
                    {item.sets.map((s) =>
                      editingSet === s.id ? (
                        <span key={s.id}>
                          <input
                            className="mono"
                            style={{ width: "4rem", padding: "0.25rem 0.4rem", fontSize: "0.85rem" }}
                            value={editWeight}
                            onChange={(e) => setEditWeight(e.target.value)}
                            placeholder="lbs"
                            inputMode="decimal"
                            aria-label="Weight"
                          />{" "}
                          ×{" "}
                          <input
                            className="mono"
                            style={{ width: "3.5rem", padding: "0.25rem 0.4rem", fontSize: "0.85rem" }}
                            value={editReps}
                            onChange={(e) => setEditReps(e.target.value)}
                            placeholder="reps"
                            inputMode="decimal"
                            aria-label="Reps"
                          />{" "}
                          <button
                            type="button"
                            className="link-button"
                            onClick={() => saveEditSet(item.id, s.id)}
                          >
                            save
                          </button>{" "}
                          <button
                            type="button"
                            className="link-button"
                            onClick={() => setEditingSet(null)}
                          >
                            cancel
                          </button>
                        </span>
                      ) : (
                        <span key={s.id}>
                          {fmtSet(s)}{" "}
                          <button
                            type="button"
                            className="link-button"
                            onClick={() => startEditSet(s)}
                            title="Edit this set"
                          >
                            edit
                          </button>
                          {"  "}
                        </span>
                      )
                    )}
                  </p>
                </div>
              ))}

              {(detail.planKind === "legs" ||
                detail.painDuring != null ||
                detail.painAfter != null ||
                detail.painNextMorning != null) && (
                <p className="history-sets" style={{ marginTop: "0.6rem" }}>
                  Knee: <PainDot label="During" value={detail.painDuring} />{" "}
                  <PainDot label="After" value={detail.painAfter} />{" "}
                  <PainDot label="Next AM" value={detail.painNextMorning} />
                </p>
              )}

              <div className="history-actions">
                <Link className="link-button" to={`/sessions/${session.id}`}>
                  Open &amp; log
                </Link>
                {detail.painNextMorning == null && (
                  <span style={{ display: "inline-flex", gap: "0.4rem", alignItems: "center" }}>
                    <input
                      className="mono"
                      style={{ width: "5.5rem", padding: "0.3rem 0.5rem", fontSize: "0.85rem" }}
                      placeholder="Next AM /10"
                      value={nextMorning}
                      onChange={(e) => setNextMorning(e.target.value)}
                      inputMode="decimal"
                    />
                    <button type="button" className="link-button" onClick={saveNextMorning}>
                      save
                    </button>
                  </span>
                )}
                <button
                  type="button"
                  className={`link-button${confirmDelete ? " danger" : ""}`}
                  onClick={deleteSelf}
                >
                  {confirmDelete ? "Confirm delete" : "Delete"}
                </button>
              </div>
              {confirmDelete && (
                <p className="muted" style={{ margin: "0.4rem 0 0" }}>
                  Deletes this session and every set in it. Can't be undone.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function Sessions() {
  const [sessions, setSessions] = useState<Session[]>([]);

  function refresh() {
    api.listSessions().then(setSessions);
  }

  useEffect(refresh, []);

  return (
    <div>
      <div className="page-head">
        <p className="kicker">
          History <span className="badge badge-lime">{sessions.length}</span>
        </p>
        <h1 className="display">Sessions</h1>
      </div>
      {sessions.length === 0 ? (
        <p className="muted">No sessions yet. Start one from a plan to log your first workout.</p>
      ) : (
        sessions.map((s) => <HistoryCard key={s.id} session={s} refresh={refresh} />)
      )}
    </div>
  );
}
