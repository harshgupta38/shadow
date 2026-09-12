import { Link } from "react-router-dom";
import { GraphUp } from "react-bootstrap-icons";

import { ROUTES } from "@/routes/RoutePaths";
import type { WeeklyMatrixRow } from "@/api";
import { useWeekStart } from "@/context/PlannerContext";
import { dayToCol, weekDayLabels, weekRangeStr } from "@/utils/weekUtils";
import { todayDate } from "@/services/date.service";
import "@/pages/track_progress/TrackProgressPage.scss";
import "./ThisWeekPanel.scss";

interface Props {
  habits: WeeklyMatrixRow[];
}

export function ThisWeekPanel({ habits }: Props) {
  const weekStart = useWeekStart();
  const today = todayDate();
  const dayLabels = weekDayLabels(weekStart);
  const todayCol = dayToCol(today, weekStart);

  return (
    <div className="dp-panel">
      <div className="dp-panel-head">
        <GraphUp size={15} className="text-muted-2" />
        <h3 className="dp-panel-title">This Week</h3>
        <span className="dp-section-chip">{weekRangeStr(today, weekStart)}</span>
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
              {dayLabels.map((d, i) => (
                <div key={`${d}-${i}`} className={`tp-matrix-day-hdr${i === todayCol ? " tp-matrix-day-hdr--today" : ""}`}>
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
                        i === todayCol ? "tp-matrix-cell--today" : "",
                        i > todayCol ? "tp-matrix-cell--future" : "",
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
