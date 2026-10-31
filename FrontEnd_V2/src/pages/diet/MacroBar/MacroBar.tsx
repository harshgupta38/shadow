import { barPercent, fmt } from "@/pages/diet/dietMath";
import "./MacroBar.scss";

type MacroTone = "protein" | "carbs" | "fat" | "fibre" | "water";

interface MacroBarProps {
  label: string;
  consumed: number;
  target: number;
  unit?: string;
  tone: MacroTone;
}

/** One nutrient against its daily target. The bar stops at 100%, the text keeps counting. */
export function MacroBar({ label, consumed, target, unit = "g", tone }: MacroBarProps) {
  const percent = target > 0 ? (consumed / target) * 100 : 0;
  return (
    <div className="dt-macro">
      <div className="dt-macro-head">
        <span className="dt-macro-label">{label}</span>
        <span className="dt-macro-values">
          <strong>{fmt(consumed)}</strong> / {fmt(target)} {unit}
        </span>
      </div>
      <div
        className={`dt-macro-track dt-tone-${tone}`}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={Math.round(target)}
        aria-valuenow={Math.round(consumed)}
        aria-valuetext={`${fmt(consumed)} of ${fmt(target)} ${unit}`}
      >
        <div className="dt-macro-fill" style={{ width: `${barPercent(percent)}%` }} />
      </div>
    </div>
  );
}
