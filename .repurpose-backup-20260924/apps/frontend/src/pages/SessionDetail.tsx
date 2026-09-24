import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type {
  SessionDetail as SessionDetailType,
  SessionItemSet as SetType,
} from "@life-kit/shared";
import { ApiError, api } from "../api.js";

type SessionItemDetail = SessionDetailType["items"][number];

/* ---------------- draft persistence (survives tab switches) ---------------- */

interface Draft {
  savedAt: number;
  sets: Record<number, { weight: string; reps: string }>;
  notes: string;
  pain: { during: number | null; after: number | null; next: number | null };
}

const draftKey = (id: number) => `lifekit:draft:session:${id}`;

function loadDraft(id: number): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(id));
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    if (Date.now() - d.savedAt > 7 * 24 * 3600 * 1000) return null;
    return d;
  } catch {
    return null;
  }
}

function persistDraft(id: number, form: LogForm) {
  try {
    const draft: Draft = {
      savedAt: Date.now(),
      sets: form.sets,
      notes: form.notes,
      pain: {
        during: form.painDuring,
        after: form.painAfter,
        next: form.painNextMorning,
      },
    };
    localStorage.setItem(draftKey(id), JSON.stringify(draft));
  } catch {
    /* storage unavailable — the workout still saves to the server */
  }
}

function clearDraft(id: number) {
  try {
    localStorage.removeItem(draftKey(id));
  } catch {
    /* ignore */
  }
}

/* ---------------- form state ---------------- */

interface LogForm {
  sets: Record<number, { weight: string; reps: string }>;
  notes: string;
  painDuring: number | null;
  painAfter: number | null;
  painNextMorning: number | null;
}

function initialForm(s: SessionDetailType): LogForm {
  const draft = loadDraft(s.id);
  const sets: Record<number, { weight: string; reps: string }> = {};
  for (const item of s.items) {
    for (const set of item.sets) {
      const d = draft?.sets[set.id];
      sets[set.id] = {
        weight: d?.weight ?? (set.weight != null ? String(set.weight) : ""),
        reps: d?.reps ?? (set.reps != null ? String(set.reps) : ""),
      };
    }
  }
  return {
    sets,
    notes: draft?.notes ?? s.notes ?? "",
    painDuring: draft?.pain.during ?? s.painDuring ?? null,
    painAfter: draft?.pain.after ?? s.painAfter ?? null,
    painNextMorning: draft?.pain.next ?? s.painNextMorning ?? null,
  };
}

/** Merge a fresh server session into the form, keeping unsaved edits. */
function mergeForm(s: SessionDetailType, prev: LogForm): LogForm {
  const sets: Record<number, { weight: string; reps: string }> = {};
  for (const item of s.items) {
    for (const set of item.sets) {
      sets[set.id] = prev.sets[set.id] ?? {
        weight: set.weight != null ? String(set.weight) : "",
        reps: set.reps != null ? String(set.reps) : "",
      };
    }
  }
  return { ...prev, sets };
}

function prettyDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function parseNum(raw: string): number | null | "invalid" {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : "invalid";
}

function workoutText(s: SessionDetailType): string {
  const lines = [`${s.planName ?? "Workout"} — ${s.date}`];
  for (const item of s.items) {
    const done = item.sets.filter((x) => x.weight != null || x.reps != null);
    if (done.length > 0) {
      lines.push(
        `${item.name}: ${done
          .map((x) => `${x.weight ?? "–"}×${x.reps ?? "–"}`)
          .join(", ")}`
      );
    }
  }
  const pains = [s.painDuring, s.painAfter, s.painNextMorning];
  if (pains.some((p) => p != null)) {
    lines.push(`Knee: ${pains.map((p) => (p == null ? "–" : `${p}/10`)).join(" · ")}`);
  }
  if (s.notes) lines.push(`Notes: ${s.notes}`);
  return lines.join("\n");
}

/* ---------------- small components ---------------- */

function PainStepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const over = value != null && value > 3;
  return (
    <div className={`pain-cell${over ? " over" : ""}`}>
      <span className="p-label">{label}</span>
      <div className="stepper">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          disabled={value == null || value <= 0}
          onClick={() => onChange(value == null ? 0 : Math.max(0, value - 1))}
        >
          −
        </button>
        <span className="p-value">{value == null ? "–" : value}</span>
        <span className="p-max">/10</span>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          disabled={value != null && value >= 10}
          onClick={() => onChange(value == null ? 1 : Math.min(10, value + 1))}
        >
          +
        </button>
      </div>
      {value != null && (
        <button type="button" className="link-button" onClick={() => onChange(null)}>
          clear
        </button>
      )}
    </div>
  );
}

/* ---------------- page ---------------- */

export default function SessionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const sessionId = Number(id);

  const [session, setSession] = useState<SessionDetailType | null>(null);
  const [form, setForm] = useState<LogForm | null>(null);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [confirmRemoveSet, setConfirmRemoveSet] = useState<number | null>(null);
  const [confirmRemoveItem, setConfirmRemoveItem] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  useEffect(() => {
    api
      .getSession(sessionId)
      .then((s) => {
        setSession(s);
        setForm((prev) => (prev ? mergeForm(s, prev) : initialForm(s)));
      })
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : "Failed to load session")
      );
  }, [sessionId]);

  useEffect(() => {
    if (form) persistDraft(sessionId, form);
  }, [form, sessionId]);

  function errMsg(e: unknown): string {
    return e instanceof ApiError ? e.message : "Something went wrong";
  }

  /** Run a mutation: tracks busy state, surfaces errors, stamps last-saved. */
  async function mutate(
    fn: () => Promise<SessionDetailType>
  ): Promise<SessionDetailType | null> {
    setBusy((b) => b + 1);
    setError(null);
    try {
      const updated = await fn();
      setSession(updated);
      setForm((prev) => (prev ? mergeForm(updated, prev) : initialForm(updated)));
      setLastSaved(new Date());
      return updated;
    } catch (e) {
      setError(errMsg(e));
      return null;
    } finally {
      setBusy((b) => b - 1);
    }
  }

  function setSetField(setId: number, field: "weight" | "reps", value: string) {
    setForm((prev) =>
      prev
        ? { ...prev, sets: { ...prev.sets, [setId]: { ...prev.sets[setId], [field]: value } } }
        : prev
    );
  }

  async function saveSet(itemId: number, set: SetType) {
    if (!form) return;
    const cur = form.sets[set.id] ?? { weight: "", reps: "" };
    const w = parseNum(cur.weight);
    const r = parseNum(cur.reps);
    if (w === "invalid" || r === "invalid") {
      // Revert the bad field to the server value.
      setForm((prev) =>
        prev
          ? {
              ...prev,
              sets: {
                ...prev.sets,
                [set.id]: {
                  weight: set.weight != null ? String(set.weight) : "",
                  reps: set.reps != null ? String(set.reps) : "",
                },
              },
            }
          : prev
      );
      setError("Numbers only in weight / reps.");
      return;
    }
    if (w === set.weight && r === set.reps) return; // nothing changed
    await mutate(() => api.updateSet(sessionId, itemId, set.id, { weight: w, reps: r }));
  }

  async function addSet(item: SessionItemDetail) {
    const next = item.sets.reduce((m, s) => Math.max(m, s.setNumber), 0) + 1;
    await mutate(() => api.logSet(sessionId, item.id, { setNumber: next }));
  }

  async function removeSet(itemId: number, set: SetType) {
    const logged = set.weight != null || set.reps != null;
    if (logged && confirmRemoveSet !== set.id) {
      setConfirmRemoveSet(set.id);
      return;
    }
    setConfirmRemoveSet(null);
    await mutate(async () => {
      await api.deleteSet(sessionId, itemId, set.id);
      return api.getSession(sessionId);
    });
    // Drop the removed row from the form so it can't linger via draft.
    setForm((prev) => {
      if (!prev) return prev;
      const sets = { ...prev.sets };
      delete sets[set.id];
      return { ...prev, sets };
    });
  }

  async function addItem(e: FormEvent) {
    e.preventDefault();
    if (!session || !newItemName.trim()) return;
    const name = newItemName.trim();
    setNewItemName("");
    await mutate(() =>
      api.addSessionItem(sessionId, { name, orderIndex: session.items.length })
    );
  }

  async function removeItem(item: SessionItemDetail) {
    const logged = item.sets.some((s) => s.weight != null || s.reps != null);
    if (logged && confirmRemoveItem !== item.id) {
      setConfirmRemoveItem(item.id);
      return;
    }
    setConfirmRemoveItem(null);
    await mutate(() => api.deleteSessionItem(sessionId, item.id));
  }

  async function saveNotes() {
    if (!form || !session) return;
    if (form.notes === (session.notes ?? "")) return;
    await mutate(() => api.updateSession(sessionId, { notes: form.notes || null }));
  }

  async function savePain(patch: {
    painDuring?: number | null;
    painAfter?: number | null;
    painNextMorning?: number | null;
  }) {
    await mutate(() => api.updateSession(sessionId, patch));
  }

  function setPainField(field: "painDuring" | "painAfter" | "painNextMorning", v: number | null) {
    setForm((prev) => (prev ? { ...prev, [field]: v } : prev));
    const key =
      field === "painDuring" ? "painDuring" : field === "painAfter" ? "painAfter" : "painNextMorning";
    savePain({ [key]: v });
  }

  async function finishWorkout() {
    if (!session || session.completedAt) return;
    setFinishing(true);
    try {
      const updated = await api.updateSession(sessionId, {
        completedAt: new Date().toISOString(),
      });
      if (updated.scheduledWorkoutId) {
        await api.updateScheduledWorkout(updated.scheduledWorkoutId, {
          status: "completed",
        });
      }
      clearDraft(sessionId);
      navigate("/sessions");
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setFinishing(false);
    }
  }

  async function deleteSession() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      await api.deleteSession(sessionId);
      clearDraft(sessionId);
      navigate("/sessions");
    } catch (e) {
      setError(errMsg(e));
    }
  }

  async function copyWorkout() {
    if (!session) return;
    const text = workoutText(session);
    const done = () => {
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 2000);
    };
    try {
      await navigator.clipboard.writeText(text);
      done();
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        done();
      } catch {
        setCopyState("error");
        setTimeout(() => setCopyState("idle"), 2000);
      }
      ta.remove();
    }
  }

  if (!session || !form) {
    return (
      <div>
        <p className="kicker">Loading</p>
        {error && <p className="error">{error}</p>}
        {!error && <p className="muted">Loading session...</p>}
      </div>
    );
  }

  const showPain =
    session.planKind === "legs" ||
    form.painDuring != null ||
    form.painAfter != null ||
    form.painNextMorning != null;
  const painOver =
    (form.painDuring ?? 0) > 3 || (form.painAfter ?? 0) > 3 || (form.painNextMorning ?? 0) > 3;

  return (
    <div>
      <div className="page-head">
        <p className="kicker">01 / Log</p>
        <h1 className="display">{session.planName ?? "Ad-hoc workout"}</h1>
        <p className="muted" style={{ margin: "0.4rem 0 0" }}>
          {prettyDate(session.date)}
          {session.completedAt && <span className="badge badge-completed"> completed</span>}
          {busy > 0 && <span className="save-state"> · Saving…</span>}
          {busy === 0 && lastSaved && (
            <span className="save-state ok">
              {" "}· Saved {lastSaved.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
        </p>
        {error && <p className="error">{error}</p>}
      </div>

      <p className="section-label">02 / Sets</p>
      {session.items.map((item) => (
        <div className="card exercise-block" key={item.id}>
          <div className="exercise-head">
            <h2 className="exercise-name">{item.name}</h2>
            <button
              type="button"
              className={`link-button${confirmRemoveItem === item.id ? " danger" : ""}`}
              onClick={() => removeItem(item)}
            >
              {confirmRemoveItem === item.id ? "Confirm remove" : "Remove"}
            </button>
          </div>
          {item.notes && <p className="exercise-note">{item.notes}</p>}

          {item.sets.map((set) => {
            const f = form.sets[set.id] ?? { weight: "", reps: "" };
            const done = set.weight != null || set.reps != null;
            const confirming = confirmRemoveSet === set.id;
            return (
              <div className="set-row" key={set.id}>
                <span className="set-num">{set.setNumber}</span>
                <input
                  className="mono"
                  inputMode="decimal"
                  placeholder={set.targetWeight != null ? String(set.targetWeight) : "lbs"}
                  title={set.targetWeight != null ? `Target: ${set.targetWeight}` : "Weight"}
                  aria-label={`${item.name} set ${set.setNumber} weight`}
                  value={f.weight}
                  onChange={(e) => setSetField(set.id, "weight", e.target.value)}
                  onBlur={() => saveSet(item.id, set)}
                />
                <input
                  className="mono"
                  inputMode="decimal"
                  placeholder={set.targetReps != null ? `×${set.targetReps}` : "reps"}
                  title={set.targetReps != null ? `Target: ${set.targetReps} reps` : "Reps"}
                  aria-label={`${item.name} set ${set.setNumber} reps`}
                  value={f.reps}
                  onChange={(e) => setSetField(set.id, "reps", e.target.value)}
                  onBlur={() => saveSet(item.id, set)}
                />
                {done ? <span className="set-done">✓</span> : <span className="set-pending">—</span>}
                <button
                  type="button"
                  className={confirming ? "set-remove confirm" : "set-remove"}
                  aria-label={confirming ? "Confirm remove set" : "Remove set"}
                  onClick={() => removeSet(item.id, set)}
                  onBlur={() => setConfirmRemoveSet(null)}
                >
                  {confirming ? "Sure?" : "×"}
                </button>
              </div>
            );
          })}

          <div className="add-set-row">
            <button type="button" className="link-button" onClick={() => addSet(item)}>
              + Add set
            </button>
          </div>
        </div>
      ))}

      <form className="card" onSubmit={addItem}>
        <p className="section-label">Add exercise</p>
        <div className="inline-form">
          <input
            placeholder="Exercise name"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            style={{ flex: 1, minWidth: "10rem" }}
          />
          <button type="submit" className="btn btn-small">
            Add
          </button>
        </div>
      </form>

      {showPain && (
        <>
          <p className="section-label">03 / Knee check</p>
          <div className="card">
            <div className="pain-grid">
              <PainStepper
                label="During"
                value={form.painDuring}
                onChange={(v) => setPainField("painDuring", v)}
              />
              <PainStepper
                label="After"
                value={form.painAfter}
                onChange={(v) => setPainField("painAfter", v)}
              />
              <PainStepper
                label="Next morning"
                value={form.painNextMorning}
                onChange={(v) => setPainField("painNextMorning", v)}
              />
            </div>
            {painOver && (
              <div className="warn-box">
                <strong>Above your 3/10 rule</strong>
                Hold or reduce knee loading until it settles — no jumping while it's
                elevated.
              </div>
            )}
          </div>
        </>
      )}

      <p className="section-label">04 / Notes</p>
      <div className="card">
        <textarea
          placeholder="How did it feel? Anything to remember next time?"
          value={form.notes}
          onChange={(e) => setForm((prev) => (prev ? { ...prev, notes: e.target.value } : prev))}
          onBlur={saveNotes}
        />
      </div>

      <div className="button-row">
        {!session.completedAt && (
          <button className="btn btn-primary" onClick={finishWorkout} disabled={finishing}>
            {finishing ? "Finishing..." : "Finish workout"}
          </button>
        )}
        <button className="btn" onClick={copyWorkout}>
          {copyState === "copied" ? "Copied ✓" : copyState === "error" ? "Copy failed" : "Copy workout"}
        </button>
        <button
          className={`btn ${confirmDelete ? "btn-danger" : ""}`}
          onClick={deleteSession}
        >
          {confirmDelete ? "Confirm delete" : "Delete"}
        </button>
      </div>
      {confirmDelete && (
        <p className="muted" style={{ marginTop: "0.5rem" }}>
          This deletes the session and every set in it. This can't be undone.
        </p>
      )}
    </div>
  );
}
