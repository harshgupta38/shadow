import { useId } from "react";

import { fmt } from "@/pages/diet/DietPage.constants";
import "./WaterBottle.scss";

interface WaterBottleProps {
  /** Water drunk today, in ml. */
  consumed: number;
  /** The day's water target, in ml. A full bottle is a day's target. */
  target: number;
}

/** A mark on the bottle for every this many ml. */
const MARK_EVERY_ML = 500;

// The drawing: the body's inside runs from the shoulder (BODY_TOP) to the base (BODY_BOTTOM); that height is the day's target.
const BODY_PATH = "M26 26 H38 C38 34 54 36 54 50 V138 Q54 146 46 146 H18 Q10 146 10 138 V50 C10 36 26 34 26 26 Z";
const BODY_TOP = 40;
const BODY_BOTTOM = 146;

/** Water drunk today as a bottle that fills toward the day's target, with a line at every 500 ml. */
export function WaterBottle({ consumed, target }: WaterBottleProps) {
  const clipId = useId();
  const span = BODY_BOTTOM - BODY_TOP;
  const share = target > 0 ? Math.min(1, Math.max(0, consumed / target)) : 0;
  const levelTop = BODY_BOTTOM - share * span;
  const marks = target > 0 ? Array.from({ length: Math.floor((target - 1) / MARK_EVERY_ML) }, (_, i) => (i + 1) * MARK_EVERY_ML) : [];

  return (
    <div className="dp-dt-water" role="img" aria-label={`Water today: ${fmt(consumed)} of ${fmt(target)} ml`}>
      <svg viewBox="0 0 64 150" className="dp-dt-bottle" aria-hidden="true">
        <defs>
          <clipPath id={clipId}>
            <path d={BODY_PATH} />
          </clipPath>
        </defs>
        <rect className="dp-dt-bottle-cap" x="24" y="2" width="16" height="10" rx="2.5" />
        <path className="dp-dt-bottle-body" d={BODY_PATH} />
        <g clipPath={`url(#${clipId})`}>
          <rect className="dp-dt-bottle-water" x="0" y={levelTop} width="64" height={BODY_BOTTOM - levelTop} />
          {share > 0 && share < 1 && <rect className="dp-dt-bottle-surface" x="0" y={levelTop} width="64" height="1.6" />}
        </g>
        <path className="dp-dt-bottle-outline" d={BODY_PATH} />
        {marks.map((ml) => {
          const y = BODY_BOTTOM - (ml / target) * span;
          return <line key={ml} className="dp-dt-bottle-mark" x1="10" x2="24" y1={y} y2={y} />;
        })}
      </svg>
    </div>
  );
}
