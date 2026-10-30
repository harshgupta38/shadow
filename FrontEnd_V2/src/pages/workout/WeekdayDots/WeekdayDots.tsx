import { WEEKDAY_LONG, WEEKDAY_SHORT } from "@/pages/workout/WorkoutPage.constants";
import "./WeekdayDots.scss";

interface WeekdayDotsProps {
  /** Weekdays (0 = Sunday) that have a session. */
  active: number[];
}

// Seven small circles, one per weekday, filled on training days.
export function WeekdayDots({ active }: WeekdayDotsProps) {
  const names = active.map((d) => WEEKDAY_LONG[d]).join(", ");
  return (
    <div className="wk-wd" role="img" aria-label={`Trains on ${names || "no days"}`}>
      {WEEKDAY_SHORT.map((label, i) => (
        <span key={label} className={`wk-wd-dot${active.includes(i) ? " is-on" : ""}`} aria-hidden="true">
          {label[0]}
        </span>
      ))}
    </div>
  );
}
