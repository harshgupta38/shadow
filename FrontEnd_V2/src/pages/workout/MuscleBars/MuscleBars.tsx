import type { MuscleSets } from "@/api/types";
import { MUSCLE_LABEL } from "@/pages/workout/WorkoutPage.constants";
import { formatSetCount } from "@/pages/workout/workoutMath";
import "./MuscleBars.scss";

interface MuscleBarsProps {
  items: MuscleSets[];
  /** Show only the top N muscles. */
  limit?: number;
}

// Horizontal bars of sets per muscle, longest first, all scaled to the busiest muscle.
export function MuscleBars({ items, limit }: MuscleBarsProps) {
  const rows = [...items].sort((a, b) => b.sets - a.sets).slice(0, limit);
  const max = Math.max(1, ...rows.map((r) => r.sets));

  return (
    <ul className="wk-mb">
      {rows.map((r, i) => (
        <li key={r.muscle} className="wk-mb-row">
          <span className="wk-mb-name">{MUSCLE_LABEL[r.muscle]}</span>
          <span className="wk-mb-track" aria-hidden="true">
            <span className="wk-mb-fill" style={{ width: `${(r.sets / max) * 100}%`, animationDelay: `${i * 40}ms` }} />
          </span>
          <span className="wk-mb-val">{formatSetCount(r.sets)} <small>sets</small></span>
        </li>
      ))}
    </ul>
  );
}
