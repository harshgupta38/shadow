import type { MuscleId } from "@/api/types";
import { BACK_VISIBLE, FRONT_VISIBLE, MUSCLE_LABEL } from "@/pages/workout/WorkoutPage.constants";
import { BACK_SHAPES, FRONT_SHAPES, HEAD, SILHOUETTE, SILHOUETTE_OUTLINE, VIEW_H, VIEW_W, type MuscleShape } from "./musclePaths";
import "./MuscleMap.scss";

export type MuscleView = "both" | "front" | "back" | "auto";
type Side = "front" | "back";
type MuscleState = "primary" | "secondary" | "idle";

interface MuscleMapProps {
  primary: MuscleId[];
  secondary?: MuscleId[];
  /** "auto" picks whichever side shows more of the highlighted muscles. */
  view?: MuscleView;
  size?: "xs" | "sm" | "md" | "lg";
  /** "Front" / "Back" captions under each figure. Defaults to on when both sides are shown. */
  captions?: boolean;
  /** Makes the muscles tappable. Called with the id of the muscle that was tapped. */
  onSelect?: (muscle: MuscleId) => void;
  /** The muscle to draw as picked. Only shown when onSelect is set. */
  selected?: MuscleId | null;
  className?: string;
}

const NO_MUSCLES: MuscleId[] = [];

function pickSide(primary: MuscleId[], secondary: MuscleId[]): Side {
  const score = (visible: MuscleId[]) =>
    primary.filter((m) => visible.includes(m)).length * 2 + secondary.filter((m) => visible.includes(m)).length;
  return score(BACK_VISIBLE) > score(FRONT_VISIBLE) ? "back" : "front";
}

function describe(primary: MuscleId[], secondary: MuscleId[]): string {
  if (primary.length === 0 && secondary.length === 0) return "Body diagram";
  const names = (list: MuscleId[]) => list.map((m) => MUSCLE_LABEL[m].toLowerCase()).join(", ");
  const parts = [];
  if (primary.length) parts.push(`primary: ${names(primary)}`);
  if (secondary.length) parts.push(`secondary: ${names(secondary)}`);
  return `Muscles worked, ${parts.join("; ")}`;
}

interface FigureProps {
  side: Side;
  stateOf: (m: MuscleId) => MuscleState;
  label: string;
  selected: MuscleId | null;
  onSelect?: (muscle: MuscleId) => void;
}

function Figure({ side, stateOf, label, selected, onSelect }: FigureProps) {
  const shapes: MuscleShape[] = side === "front" ? FRONT_SHAPES : BACK_SHAPES;
  const mirror = `translate(${VIEW_W} 0) scale(-1 1)`;

  const classOf = (m: MuscleId) => {
    const tappable = onSelect ? " mm-muscle--interactive" : "";
    const picked = m === selected ? " mm-muscle--selected" : "";
    return `mm-muscle mm-muscle--${stateOf(m)}${tappable}${picked}`;
  };

  // Same shapes twice: as drawn for the right half, mirrored for the left half.
  const halves = (
    <>
      <path d={SILHOUETTE} className="mm-body" />
      <path d={SILHOUETTE_OUTLINE} className="mm-outline" />
      {shapes.map((s, i) => (
        <path key={i} d={s.d} className={classOf(s.muscle)} onClick={onSelect ? () => onSelect(s.muscle) : undefined}>
          <title>{MUSCLE_LABEL[s.muscle]}</title>
        </path>
      ))}
    </>
  );

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="mm-svg"
      role={onSelect ? undefined : "img"}
      aria-hidden={onSelect ? true : undefined}
      aria-label={onSelect ? undefined : label}
    >
      <ellipse cx={HEAD.cx} cy={HEAD.cy} rx={HEAD.rx} ry={HEAD.ry} className="mm-body mm-body--head" />
      <g>{halves}</g>
      <g transform={mirror}>{halves}</g>
    </svg>
  );
}

export function MuscleMap({
  primary,
  secondary = NO_MUSCLES,
  view = "both",
  size = "md",
  captions,
  onSelect,
  selected = null,
  className,
}: MuscleMapProps) {
  const stateOf = (m: MuscleId): MuscleState => (primary.includes(m) ? "primary" : secondary.includes(m) ? "secondary" : "idle");
  const sides: Side[] = view === "both" ? ["front", "back"] : view === "auto" ? [pickSide(primary, secondary)] : [view];
  const showCaptions = captions ?? sides.length > 1;
  const label = describe(primary, secondary);

  return (
    <div className={`mm mm--${size}${className ? ` ${className}` : ""}`}>
      {sides.map((side) => (
        <figure key={side} className="mm-figure">
          <Figure
            side={side}
            stateOf={stateOf}
            label={`${side === "front" ? "Front" : "Back"} view. ${label}`}
            selected={selected}
            onSelect={onSelect}
          />
          {showCaptions && <figcaption className="mm-caption">{side === "front" ? "Front" : "Back"}</figcaption>}
        </figure>
      ))}
    </div>
  );
}

export function MuscleLegend({ className }: { className?: string }) {
  return (
    <div className={`mm-legend${className ? ` ${className}` : ""}`} aria-hidden="true">
      <span className="mm-legend-item"><i className="mm-swatch mm-swatch--primary" /> Primary</span>
      <span className="mm-legend-item"><i className="mm-swatch mm-swatch--secondary" /> Secondary</span>
    </div>
  );
}

interface MuscleChipsProps {
  primary: MuscleId[];
  secondary?: MuscleId[];
  /** Cap the number of chips; the rest collapses into "+N". */
  max?: number;
}

export function MuscleChips({ primary, secondary = NO_MUSCLES, max }: MuscleChipsProps) {
  const all = [
    ...primary.map((m) => ({ m, kind: "primary" as const })),
    ...secondary.filter((m) => !primary.includes(m)).map((m) => ({ m, kind: "secondary" as const })),
  ];
  const shown = max ? all.slice(0, max) : all;
  const hidden = all.length - shown.length;

  return (
    <span className="mm-chips">
      {shown.map(({ m, kind }) => (
        <span key={m} className={`mm-chip mm-chip--${kind}`}>
          <i className="mm-dot" />
          {MUSCLE_LABEL[m]}
        </span>
      ))}
      {hidden > 0 && <span className="mm-chip mm-chip--more">+{hidden}</span>}
    </span>
  );
}
