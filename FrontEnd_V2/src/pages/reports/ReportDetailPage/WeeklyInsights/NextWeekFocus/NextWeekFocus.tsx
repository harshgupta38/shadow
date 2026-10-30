import { Bullseye } from "react-bootstrap-icons";

import type { WeeklyFocus } from "@/api/types";
import "./NextWeekFocus.scss";

export function NextWeekFocus({ focus }: { focus: WeeklyFocus }) {
  const target = focus.target_pct;
  return (
    <div className="wi-focus">
      <span className="wi-focus-icon" aria-hidden="true"><Bullseye size={18} /></span>
      <div className="wi-focus-body">
        <span className="wi-focus-eyebrow">Try this next week</span>
        <h3 className="wi-focus-title">{focus.title}</h3>
        <p className="wi-focus-why">{focus.rationale}</p>
      </div>
      <div className="wi-focus-meter">
        <div className="wi-focus-meter-top">
          <span>{focus.metric_label}</span>
          <span>
            <strong>{focus.current_pct}%</strong>
            {target !== null && <> to <strong>{target}%</strong></>}
          </span>
        </div>
        <div
          className="wi-focus-track"
          role="img"
          aria-label={`${focus.metric_label}: ${focus.current_pct}% now${target === null ? "" : `, target ${target}%`}`}
        >
          <span className="wi-focus-fill" style={{ width: `${focus.current_pct}%` }} />
          {target !== null && <span className="wi-focus-target" style={{ left: `${target}%` }} />}
        </div>
      </div>
    </div>
  );
}
