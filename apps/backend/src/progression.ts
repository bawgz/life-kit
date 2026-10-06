// Progression engine: given an exercise's template and its recent logged
// history, compute the next targets. Pure — no DB access — so it's easy to
// test. Based on:
// - Double progression within a rep range (ACSM 2009: add 2–10% load once
//   the current load can be done for 1–2 reps over the target).
// - NSCA load increments: upper body +2–5 lb, lower body +5–10 lb for newer
//   lifters; rounded to Luke's "no half weights, round up to 5" rule.
// Targets are computed per set from what was actually lifted, so warm-up
// ramps (95/135/135) and pyramids (6/5/3 pull-ups) keep their shape.
import type { ExerciseType } from "@life-kit/shared";

export interface HistorySet {
  setNumber: number;
  reps: number | null;
  weight: number | null;
  durationSeconds: number | null;
  /** The goal that day (snapshot copied from the plan when the session started). */
  targetReps: number | null;
  targetWeight: number | null;
  targetDurationSeconds: number | null;
}

export interface HistorySession {
  date: string; // ISO date
  /** Highest knee-pain score recorded for the session, if any. */
  maxPain: number | null;
  sets: HistorySet[];
}

export interface TemplateSet {
  id: number;
  setNumber: number;
  targetReps: number | null;
  targetWeight: number | null;
  targetDurationSeconds: number | null;
}

export interface TemplateItem {
  name: string;
  exerciseType: ExerciseType;
  notes: string | null;
  rangeMin: number | null;
  rangeMax: number | null;
  sets: TemplateSet[];
}

export interface Progression {
  /** New targets for every template set (unchanged ones included). */
  sets: TemplateSet[];
  note: string;
}

/** Knee pain above this on a leg day blocks any increase (Luke's 3/10 rule). */
export const PAIN_LIMIT = 3;
const TIMED_STEP_SECONDS = 5;
const DEFAULT_TIMED_CAP_SECONDS = 60;
/** Logged load this far from the target suggests different equipment. */
const EQUIPMENT_MISMATCH_RATIO = 1.5;
const DELOAD_FACTOR = 0.9;

const LOWER_BODY =
  /squat|deadlift|\brdl\b|leg press|lunge|hip thrust|calf|step[- ]?up|glute|hamstring|leg curl|leg extension/i;

const ceil5 = (w: number) => Math.ceil(w / 5) * 5;
const floor5 = (w: number) => Math.floor(w / 5) * 5;
const load = (w: number | null | undefined) => w ?? 0;

function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** NSCA-style step, in 5s: +10 lb for heavier lower-body work, else +5. */
export function loadIncrement(weight: number, lowerBody: boolean): number {
  return lowerBody && weight >= 100 ? 10 : 5;
}

/** The rep range: explicit, else an "8-12 reps" note, else the target ± 2. */
export function repRange(item: TemplateItem): [number, number] {
  if (item.rangeMin != null && item.rangeMax != null) return [item.rangeMin, item.rangeMax];
  const fromNotes = item.notes && /(\d+)\s*[-–]\s*(\d+)\s*reps/i.exec(item.notes);
  if (fromNotes) return [Number(fromNotes[1]), Number(fromNotes[2])];
  const t = item.sets.find((s) => s.targetReps != null)?.targetReps ?? 10;
  return [item.rangeMin ?? Math.max(1, t - 2), item.rangeMax ?? t + 2];
}

/** The hold-time range in seconds: explicit, else current target up to 60s. */
export function timeRange(item: TemplateItem): [number, number] {
  const t = item.sets.find((s) => s.targetDurationSeconds != null)?.targetDurationSeconds ?? 30;
  return [
    item.rangeMin ?? t,
    item.rangeMax ?? Math.max(t, DEFAULT_TIMED_CAP_SECONDS),
  ];
}

/**
 * Next targets for one exercise, or null when there's no logged history.
 * `history` is newest first and only contains sessions where the exercise
 * has at least one logged set.
 */
export function progressItem(
  item: TemplateItem,
  planKind: string | null,
  history: HistorySession[]
): Progression | null {
  const latest = history[0];
  if (!latest) return null;
  return item.exerciseType === "timed"
    ? progressTimed(item, planKind, latest)
    : progressReps(item, planKind, latest, history[1]);
}

function kneeHold(planKind: string | null, session: HistorySession): boolean {
  return planKind === "legs" && session.maxPain != null && session.maxPain > PAIN_LIMIT;
}

function progressReps(
  item: TemplateItem,
  planKind: string | null,
  latest: HistorySession,
  previous: HistorySession | undefined
): Progression | null {
  const logged = latest.sets.filter((s) => s.reps != null);
  if (logged.length === 0) return null;
  const day = shortDate(latest.date);
  const [lo, hi] = repRange(item);
  const bodyweight = item.exerciseType === "bodyweight";
  const lowerBody = planKind === "legs" || LOWER_BODY.test(item.name);
  const loggedBySet = new Map(logged.map((s) => [s.setNumber, s]));

  // What was asked of each logged set that day. Deliberately not the current
  // template: that's what this function rewrites, so reading it back would
  // make a second run with the same history give a different answer.
  const goal = (s: HistorySet) => ({
    reps: s.targetReps ?? lo,
    weight: s.targetWeight,
  });

  if (!bodyweight) {
    const maxLogged = Math.max(...logged.map((s) => load(s.weight)));
    const maxTarget = Math.max(0, ...item.sets.map((s) => load(s.targetWeight)));
    if (
      maxLogged > 0 &&
      maxTarget > 0 &&
      (maxLogged > maxTarget * EQUIPMENT_MISMATCH_RATIO ||
        maxLogged < maxTarget / EQUIPMENT_MISMATCH_RATIO)
    ) {
      return {
        sets: item.sets,
        note: `${day}: logged ${maxLogged} lb against a ${maxTarget} lb target — different equipment? Targets unchanged; edit them if the new weight is right.`,
      };
    }
  }

  const knee = kneeHold(planKind, latest);
  const belowRange = (session: HistorySession | undefined) =>
    !!session && session.sets.some((s) => s.reps != null && s.reps < lo);
  const maxLoad = (session: HistorySession) =>
    Math.max(0, ...session.sets.map((s) => load(s.weight)));
  const deload =
    !knee &&
    !bodyweight &&
    belowRange(latest) &&
    belowRange(previous) &&
    maxLoad(latest) >= maxLoad(previous!) &&
    maxLoad(latest) > 0;

  // Every template set logged at the top of the range, at (at least) its goal load.
  const allAtTop = item.sets.every((t) => {
    const s = loggedBySet.get(t.setNumber);
    return !!s && s.reps! >= hi && load(s.weight) >= load(goal(s).weight);
  });
  const usedLoad = logged.some((s) => load(s.weight) > 0);
  const addLoad = !knee && !deload && allAtTop && (!bodyweight || usedLoad);

  let met = 0;
  let heaviest = 0;
  let lighter = 0; // sets that hit the reps, but under the goal load
  const sets = item.sets.map((t): TemplateSet => {
    const s = loggedBySet.get(t.setNumber);
    if (!s) return t;
    const g = goal(s);
    // Follow what was actually lifted, but never drop below the goal on a
    // lighter day — only the deload rule lowers weight.
    const lifted = s.weight != null ? ceil5(s.weight) : null;
    const base = lifted == null && g.weight == null ? null : Math.max(load(g.weight), load(lifted));
    const hitGoal = s.reps! >= g.reps && load(s.weight) >= load(g.weight);
    if (hitGoal) met++;
    else if (s.reps! >= g.reps) lighter++;
    heaviest = Math.max(heaviest, load(base));

    if (knee) return { ...t, targetReps: g.reps, targetWeight: base };
    if (deload) {
      return { ...t, targetReps: lo, targetWeight: base == null ? null : floor5(base * DELOAD_FACTOR) };
    }
    if (addLoad) {
      return { ...t, targetReps: lo, targetWeight: load(base) + loadIncrement(load(base), lowerBody) };
    }
    const reps = hitGoal ? Math.min(hi, Math.max(g.reps, s.reps!) + 1) : g.reps;
    return { ...t, targetReps: reps, targetWeight: base };
  });

  let note: string;
  if (knee) {
    note = `${day}: knee pain ${latest.maxPain}/10 is over ${PAIN_LIMIT} — holding targets until it settles.`;
  } else if (deload) {
    note = `${day}: below ${lo} reps two sessions running — weight down 10%, back to ${lo} reps.`;
  } else if (addLoad) {
    note = `${day}: hit ${hi} reps on every set → +${loadIncrement(heaviest, lowerBody)} lb, back to ${lo} reps.`;
  } else if (allAtTop) {
    note = `${day}: top of the ${lo}–${hi} range at bodyweight — add load (e.g. +5 lb) or a harder variation to keep progressing.`;
  } else if (met === 0 && lighter > 0) {
    note = `${day}: reps done at a lighter weight than the goal — same targets next time.`;
  } else if (met === 0) {
    note = `${day}: target reps not reached — same targets next time.`;
  } else if (met === logged.length && logged.length >= item.sets.length) {
    note = `${day}: hit every target → +1 rep (working toward ${hi} on every set, then more weight).`;
  } else {
    note = `${day}: ${met} of ${item.sets.length} sets hit target → +1 rep on those.`;
  }
  return { sets, note };
}

function progressTimed(
  item: TemplateItem,
  planKind: string | null,
  latest: HistorySession
): Progression | null {
  const logged = latest.sets.filter((s) => s.durationSeconds != null);
  if (logged.length === 0) return null;
  const day = shortDate(latest.date);
  const [lo, hi] = timeRange(item);
  const knee = kneeHold(planKind, latest);
  const loggedBySet = new Map(logged.map((s) => [s.setNumber, s]));

  let met = 0;
  let capped = 0;
  const sets = item.sets.map((t): TemplateSet => {
    const s = loggedBySet.get(t.setNumber);
    if (!s) return t;
    const goal = s.targetDurationSeconds ?? lo; // that day's goal, not the template (see progressReps)
    const lifted = s.weight != null ? ceil5(s.weight) : null;
    const weight =
      lifted == null && t.targetWeight == null ? null : Math.max(load(t.targetWeight), load(lifted));
    const hitGoal = s.durationSeconds! >= goal;
    if (hitGoal) met++;
    if (hitGoal && goal >= hi) capped++;
    const next = !knee && hitGoal ? Math.min(hi, goal + TIMED_STEP_SECONDS) : goal;
    return { ...t, targetDurationSeconds: next, targetWeight: weight };
  });

  let note: string;
  if (knee) {
    note = `${day}: knee pain ${latest.maxPain}/10 is over ${PAIN_LIMIT} — holding targets until it settles.`;
  } else if (met === 0) {
    note = `${day}: holds came up short — same targets next time.`;
  } else if (capped === met && met >= item.sets.length) {
    note = `${day}: at the ${hi}s cap on every set — progress by adding load.`;
  } else if (met >= item.sets.length) {
    note = `${day}: held every set → +${TIMED_STEP_SECONDS}s (up to ${hi}s).`;
  } else {
    note = `${day}: ${met} of ${item.sets.length} holds hit target → +${TIMED_STEP_SECONDS}s on those.`;
  }
  return { sets, note };
}
