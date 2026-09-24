import type { PlanDetail as PlanDetailType } from "@life-kit/shared";
import { formatTarget, sameTargets } from "../format.js";

/** Full template sheet: every exercise with its preset sets and goal weights/reps. */
export default function PresetSets({ plan }: { plan: PlanDetailType }) {
  return (
    <>
      {plan.items.map((item) => (
        <div className="preset-exercise" key={item.id}>
          <div className="preset-exercise-name">{item.name}</div>
          {item.notes && <div className="muted">{item.notes}</div>}
          {item.sets.length === 0 ? (
            <div className="muted preset-empty">No preset sets</div>
          ) : sameTargets(item.sets) ? (
            <div className="preset-line mono">
              {item.sets.length} × {formatTarget(item.sets[0])}
            </div>
          ) : (
            item.sets.map((s) => (
              <div className="preset-row" key={s.id}>
                <span className="set-num">{s.setNumber}</span>
                <span className="mono">{formatTarget(s)}</span>
              </div>
            ))
          )}
        </div>
      ))}
      {plan.items.length === 0 && (
        <p className="muted">No exercises in this template yet.</p>
      )}
    </>
  );
}
