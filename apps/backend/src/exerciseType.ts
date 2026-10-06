import type { ExerciseType } from "@life-kit/shared";

const EXERCISE_TYPES: readonly ExerciseType[] = ["weighted", "bodyweight", "timed"];

/** True for undefined (field omitted) or a known type; false for anything else. */
export function isValidExerciseType(value: unknown): value is ExerciseType | undefined {
  return value === undefined || EXERCISE_TYPES.includes(value as ExerciseType);
}

export const exerciseTypeError = {
  error: `exerciseType must be one of: ${EXERCISE_TYPES.join(", ")}`,
};
