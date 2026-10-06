import type { ExerciseType } from "@life-kit/shared";

export const EXERCISE_TYPE_LABELS: Record<ExerciseType, string> = {
  weighted: "Weighted",
  bodyweight: "Bodyweight",
  timed: "Timed",
};

/** Seconds as "45s" or "1:30". */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Seconds as an editable input value, always m:ss ("0:45") so it reads as a time. */
export function durationInputValue(seconds: number | null | undefined): string {
  if (seconds == null) return "";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Parses "45", "45s", or "1:30" to seconds; "" is null. */
export function parseDuration(raw: string): number | null | "invalid" {
  const t = raw.trim().toLowerCase().replace(/s$/, "");
  if (t === "") return null;
  const mmss = /^(\d+):([0-5]\d)$/.exec(t);
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]);
  return /^\d+$/.test(t) ? Number(t) : "invalid";
}

export function parseNum(raw: string): number | null | "invalid" {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : "invalid";
}

/** Column label for the weight input. */
export function weightLabel(type: ExerciseType): string {
  return type === "bodyweight" ? "+ lb" : "lb";
}

/** Column label for the reps-or-time input. */
export function amountLabel(type: ExerciseType): string {
  return type === "timed" ? "Time" : "Reps";
}

/** Placeholder for an empty weight input. */
export function weightPlaceholder(type: ExerciseType): string {
  return type === "bodyweight" ? "BW" : type === "timed" ? "opt." : "lb";
}

/** "60 lb", "BW", "BW + 25 lb", or null when there's nothing to say. */
export function formatWeight(weight: number | null | undefined, type: ExerciseType): string | null {
  if (type === "bodyweight") return weight ? `BW + ${weight} lb` : "BW";
  return weight != null ? `${weight} lb` : null;
}

/** "10 reps" or "0:45", or null when unset. */
function formatAmount(
  reps: number | null | undefined,
  seconds: number | null | undefined,
  type: ExerciseType
): string | null {
  if (type === "timed") return seconds != null ? formatDuration(seconds) : null;
  return reps != null ? `${reps} ${reps === 1 ? "rep" : "reps"}` : null;
}

function joinParts(amount: string | null, weight: string | null): string {
  if (amount && weight) return `${amount} @ ${weight}`;
  return amount ?? weight ?? "—";
}

type TargetSet = {
  targetWeight?: number | null;
  targetReps?: number | null;
  targetDurationSeconds?: number | null;
};

/** One set's goal, e.g. "10 reps @ 60 lb", "8 reps @ BW", "45s". */
export function formatTarget(set: TargetSet, type: ExerciseType): string {
  return joinParts(
    formatAmount(set.targetReps, set.targetDurationSeconds, type),
    formatWeight(set.targetWeight, type)
  );
}

/** One logged set, e.g. "10 reps @ 60 lb". */
export function formatActual(
  set: { weight: number | null; reps: number | null; durationSeconds: number | null },
  type: ExerciseType
): string {
  // Nothing logged yet: don't let a bodyweight set read as "BW".
  if (set.weight == null && set.reps == null && set.durationSeconds == null) return "—";
  return joinParts(formatAmount(set.reps, set.durationSeconds, type), formatWeight(set.weight, type));
}

/** True when every set in the list shares identical targets. */
export function sameTargets(sets: TargetSet[]): boolean {
  const key = (s: TargetSet) =>
    `${s.targetWeight ?? ""}|${s.targetReps ?? ""}|${s.targetDurationSeconds ?? ""}`;
  return sets.every((s) => key(s) === key(sets[0]));
}

/**
 * A whole exercise's goal on one line:
 * - every set the same: "3 × 10 reps @ 60 lb"
 * - same weight, varying reps/time: "6, 5, 3 reps @ BW"
 * - otherwise each set in order: "10 reps @ 50 lb · 12 reps @ 40 lb"
 */
export function formatPrescription(sets: TargetSet[], type: ExerciseType): string {
  if (sets.length === 0) return "No sets";
  if (sameTargets(sets)) return `${sets.length} × ${formatTarget(sets[0], type)}`;

  const timed = type === "timed";
  const amounts = sets.map((s) => (timed ? s.targetDurationSeconds : s.targetReps));
  const sameWeight = sets.every((s) => (s.targetWeight ?? null) === (sets[0].targetWeight ?? null));
  if (sameWeight && amounts.every((a) => a != null)) {
    const list = amounts.map((a) => (timed ? formatDuration(a!) : String(a))).join(", ");
    return joinParts(timed ? list : `${list} reps`, formatWeight(sets[0].targetWeight, type));
  }
  // Same reps, ramping weight (warm-up sets): "3 × 8 reps @ 100 / 145 / 145 lb".
  const sameAmount = amounts.every((a) => a === amounts[0]);
  if (sameAmount && type === "weighted" && sets.every((s) => s.targetWeight != null)) {
    const weights = sets.map((s) => s.targetWeight).join(" / ");
    return `${sets.length} × ${formatTarget({ ...sets[0], targetWeight: null }, type)} @ ${weights} lb`;
  }
  return sets.map((s) => formatTarget(s, type)).join(" · ");
}
