import type { PlanDetail as PlanDetailType } from "@life-kit/shared";
import { formatPrescription } from "../format.js";
import { ExerciseTypeBadge } from "./ExerciseFields.js";

/** Full template sheet: every exercise with its goal sets, reps/time, and weight. */
export default function PresetSets({ plan }: { plan: PlanDetailType }) {
  return (
    <>
      {plan.items.map((item) => (
        <div className="preset-exercise" key={item.id}>
          <div className="preset-exercise-name">
            {item.name} <ExerciseTypeBadge type={item.exerciseType} />
          </div>
          <div className="preset-line mono">
            {formatPrescription(item.sets, item.exerciseType)}
          </div>
          {item.progressNote && <div className="progress-note">{item.progressNote}</div>}
          {item.notes && <div className="muted">{item.notes}</div>}
        </div>
      ))}
      {plan.items.length === 0 && (
        <p className="muted">No exercises in this template yet.</p>
      )}
    </>
  );
}
