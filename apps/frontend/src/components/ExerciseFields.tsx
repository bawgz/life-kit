import type { CreatePlanItemInput, ExerciseType } from "@life-kit/shared";
import {
  EXERCISE_TYPE_LABELS,
  amountLabel,
  parseDuration,
  parseNum,
  weightLabel,
  weightPlaceholder,
} from "../format.js";

/** Dropdown for an exercise's type. */
export function ExerciseTypeSelect({
  value,
  onChange,
  label,
}: {
  value: ExerciseType;
  onChange: (t: ExerciseType) => void;
  label: string;
}) {
  return (
    <select
      className="type-select"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as ExerciseType)}
    >
      {(Object.keys(EXERCISE_TYPE_LABELS) as ExerciseType[]).map((t) => (
        <option key={t} value={t}>
          {EXERCISE_TYPE_LABELS[t]}
        </option>
      ))}
    </select>
  );
}

/** Small "Bodyweight" / "Timed" tag; weighted is the default and gets none. */
export function ExerciseTypeBadge({ type }: { type: ExerciseType }) {
  if (type === "weighted") return null;
  return <span className={`badge badge-type-${type}`}>{EXERCISE_TYPE_LABELS[type]}</span>;
}

/** An exercise being added to a template, before it's saved. */
export interface ExerciseDraft {
  name: string;
  type: ExerciseType;
  sets: number;
  amount: string; // reps, or a time like "45" / "1:30" for timed
  weight: string;
}

export function emptyDraft(): ExerciseDraft {
  return { name: "", type: "weighted", sets: 3, amount: "", weight: "" };
}

/** Converts a draft to the API shape, or returns an error message. */
export function draftToItem(d: ExerciseDraft, orderIndex: number): CreatePlanItemInput | string {
  const weight = parseNum(d.weight);
  if (weight === "invalid") return `${d.name}: weight must be a number.`;
  const timed = d.type === "timed";
  const amount = timed ? parseDuration(d.amount) : parseNum(d.amount);
  if (amount === "invalid") {
    return timed
      ? `${d.name}: time must be seconds (45) or minutes:seconds (1:30).`
      : `${d.name}: reps must be a number.`;
  }
  return {
    name: d.name.trim(),
    exerciseType: d.type,
    orderIndex,
    sets: Array.from({ length: Math.max(1, d.sets) }, (_, i) => ({
      setNumber: i + 1,
      targetReps: timed ? null : amount,
      targetDurationSeconds: timed ? amount : null,
      targetWeight: weight,
    })),
  };
}

/** Name, type, sets, reps-or-time, and weight inputs for one new exercise. */
export function ExerciseDraftFields({
  draft,
  onChange,
}: {
  draft: ExerciseDraft;
  onChange: (patch: Partial<ExerciseDraft>) => void;
}) {
  const timed = draft.type === "timed";
  return (
    <div className="draft-exercise">
      <div className="draft-row">
        <input
          placeholder="Exercise (e.g. Bench Press)"
          aria-label="Exercise name"
          value={draft.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <ExerciseTypeSelect
          label="Exercise type"
          value={draft.type}
          onChange={(type) => onChange({ type })}
        />
      </div>
      <div className="draft-row draft-numbers">
        <label>
          <span>Sets</span>
          <input
            type="number"
            min={1}
            className="mono"
            value={draft.sets}
            onChange={(e) => onChange({ sets: Number(e.target.value) })}
          />
        </label>
        <label>
          <span>{amountLabel(draft.type)}</span>
          <input
            className="mono"
            inputMode={timed ? "text" : "numeric"}
            placeholder={timed ? "0:45" : "10"}
            value={draft.amount}
            onChange={(e) => onChange({ amount: e.target.value })}
          />
        </label>
        <label>
          <span>{weightLabel(draft.type)}</span>
          <input
            className="mono"
            inputMode="decimal"
            placeholder={weightPlaceholder(draft.type)}
            value={draft.weight}
            onChange={(e) => onChange({ weight: e.target.value })}
          />
        </label>
      </div>
    </div>
  );
}
