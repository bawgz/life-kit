/** Format a plan/session set's goal target as compact text, e.g. "60 × 10". */
export function formatTarget(set: {
  targetWeight?: number | null;
  targetReps?: number | null;
  targetDurationSeconds?: number | null;
  targetDistanceMeters?: number | null;
}): string {
  const bits: string[] = [];
  if (set.targetWeight != null) bits.push(`${set.targetWeight}`);
  if (set.targetReps != null) bits.push(`×${set.targetReps}`);
  if (set.targetDurationSeconds != null) bits.push(`${set.targetDurationSeconds}s`);
  if (set.targetDistanceMeters != null) bits.push(`${set.targetDistanceMeters}m`);
  return bits.join(" ") || "—";
}

/** True when every set in the list shares identical targets. */
export function sameTargets<T extends Parameters<typeof formatTarget>[0]>(sets: T[]): boolean {
  if (sets.length === 0) return true;
  const key = (s: T) =>
    `${s.targetWeight ?? ""}|${s.targetReps ?? ""}|${s.targetDurationSeconds ?? ""}|${s.targetDistanceMeters ?? ""}`;
  return sets.every((s) => key(s) === key(sets[0]));
}
