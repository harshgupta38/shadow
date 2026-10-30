import { ArrowDownShort, ArrowUpShort } from "react-bootstrap-icons";

import type { WeeklyMetricKind } from "@/api/types";
import { formatDuration } from "@/services/date.service";
import "./Delta.scss";

interface DeltaProps {
  delta: number;
  kind: WeeklyMetricKind;
  goodWhenUp?: boolean;
}

function formatMagnitude(mag: number, kind: WeeklyMetricKind): string {
  if (kind === "minutes") return formatDuration(mag);
  if (kind === "days") return `${mag} ${mag === 1 ? "day" : "days"}`;
  return `${mag} pts`;
}

// Direction is carried by the arrow icon and the signed text, not by colour alone.
export function Delta({ delta, kind, goodWhenUp = true }: DeltaProps) {
  const dir = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const tone = dir === "flat" ? "flat" : (dir === "up") === goodWhenUp ? "good" : "bad";
  const text = dir === "flat" ? "even" : formatMagnitude(Math.abs(delta), kind);
  const Icon = dir === "up" ? ArrowUpShort : ArrowDownShort;
  const spoken = dir === "flat" ? "No change" : `${dir === "up" ? "Up" : "Down"} ${text}`;

  return (
    <span className={`wi-delta wi-delta--${tone}`} aria-label={`${spoken} versus last week`}>
      {dir !== "flat" && <Icon size={16} aria-hidden="true" />}
      {text}
    </span>
  );
}
