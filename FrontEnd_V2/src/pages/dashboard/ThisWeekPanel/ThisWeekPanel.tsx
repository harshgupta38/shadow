import { Link } from "react-router-dom";
import { GraphUp } from "react-bootstrap-icons";

import { ROUTES } from "@/routes/RoutePaths";
import { TODAY_COL, WEEK_DAY_LABELS, WEEK_RANGE } from "@/pages/track_progress/TrackProgressPage.constants";
import type { WeeklyMatrixRow } from "@/api";
import "@/pages/track_progress/TrackProgressPage.scss";
import "./ThisWeekPanel.scss";

interface Props {
  habits: WeeklyMatrixRow[];
}

export function ThisWeekPanel({ habits }: Props) {
  return (
    <div className="dp-panel">
      <div className="dp-panel-head">
        <GraphUp size={15} className="text-muted-2" />
        <h3 className="dp-panel-title">This Week</h3>
        <span className="dp-section-chip">{WEEK_RANGE}</span>
        <Link to={ROUTES.TRACK_PROGRESS} className="dp-section-link">View all →</Link>
      </div>
      {habits.length === 0 ? (
        <div className="dp-week-empty">
          <span className="dp-week-empty-icon" aria-hidden="true">🎯</span>
          <p className="dp-week-empty-title">No habits tracked yet</p>
          <p className="dp-week-empty-sub">Turn on tracking for a habit to see your weekly progress here.</p>
        </div>
      ) : (
        <div className="dp-matrix-scroll">
          <div className="tp-matrix-wrap">
            <div className="tp-matrix-row tp-matrix-row--header">
              <div className="tp-matrix-label tp-matrix-label--hdr">Habit</div>
              {WEEK_DAY_LABELS.map((d, i) => (
                <div key={`${d}-${i}`} className={`tp-matrix-day-hdr${i === TODAY_COL ? " tp-matrix-day-hdr--today" : ""}`}>
                  {d}
                </div>
              ))}
              <div className="tp-matrix-pct-hdr">Progress</div>
            </div>
            {habits.map((row) => {
              const pct = Math.round((row.week.filter(Boolean).length / 7) * 100);
              return (
                <div key={row.id} className="tp-matrix-row">
                  <div className="tp-matrix-label">
                    <span className="tp-matrix-habit-name">{row.title}</span>
                  </div>
                  {row.week.map((done, i) => (
                    <div
                      key={i}
                      className={[
                        "tp-matrix-cell",
                        done ? "tp-matrix-cell--done" : "tp-matrix-cell--miss",
                        i === TODAY_COL ? "tp-matrix-cell--today" : "",
                        i > TODAY_COL ? "tp-matrix-cell--future" : "",
                      ].filter(Boolean).join(" ")}
                    />
                  ))}
                  <div className="tp-matrix-pct-cell">
                    <span className="tp-matrix-pct-text">{pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
