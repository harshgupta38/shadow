import { CheckCircleFill } from "react-bootstrap-icons";

import type { WeeklyMissedItem } from "@/api/types";
import { MISSED_KIND_LABEL } from "../WeeklyInsights.constants";
import "./MostMissed.scss";

export function MostMissed({ items }: { items: WeeklyMissedItem[] }) {
  if (items.length === 0) {
    return (
      <p className="wi-callout wi-callout--good">
        <CheckCircleFill size={13} aria-hidden="true" />
        <span>Nothing was missed more than once this week.</span>
      </p>
    );
  }

  return (
    <ul className="wi-missed">
      {items.map((it) => (
        <li key={it.id} className="wi-missed-item">
          <div className="wi-missed-top">
            <span className="wi-missed-title">{it.title}</span>
            <span className="wi-missed-count">{it.misses}&times; missed</span>
          </div>
          <span className="wi-missed-kind">{MISSED_KIND_LABEL[it.kind]}</span>
          {it.note && <blockquote className="wi-missed-note">&ldquo;{it.note}&rdquo;</blockquote>}
        </li>
      ))}
    </ul>
  );
}
