import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Clock, MoonFill, MoonStarsFill, SunFill } from "react-bootstrap-icons";

import { ROUTES } from "@/routes/RoutePaths";
import { PRIORITY_COLOR } from "@/constant/priority";
import { ProgressRing } from "@/components/ui/ProgressRing/ProgressRing";
import type { DashboardTodayItem } from "@/api";
import { useTimeFormat } from "@/context/PlannerContext";
import { computeCompletion, completionMessage, remainingLabel, timeLabel, topUndoneItems } from "./TodaySnapshot.constants";
import "./TodaySnapshot.scss";

interface Props {
  items: DashboardTodayItem[];
  currentStreak: number;
  latestAlignmentScore: number;
}

// Mirrors TimeChip in PlanCard — kept local since it's a tiny, page-specific piece.
function TimeChip({ preferredTime, label }: { preferredTime: string; label: string }) {
  const t = preferredTime.toLowerCase();
  let icon: ReactNode;
  let mod = "";

  if (t === "morning") { icon = <SunFill size={11} />; mod = "dp-today-item-time--morning"; }
  else if (t === "afternoon") { icon = <SunFill size={11} />; mod = "dp-today-item-time--afternoon"; }
  else if (t === "evening") { icon = <MoonFill size={10} />; mod = "dp-today-item-time--evening"; }
  else if (t === "night") { icon = <MoonStarsFill size={10} />; mod = "dp-today-item-time--night"; }
  else { icon = <Clock size={11} />; mod = "dp-today-item-time--clock"; }

  return (
    <span className={`dp-today-item-time ${mod}`}>
      {icon}
      {label}
    </span>
  );
}

export function TodaySnapshot({ items, currentStreak, latestAlignmentScore }: Props) {
  const timeFormat = useTimeFormat();
  const habitItems = items.filter((item) => item.source_type === "habit");
  const taskItems = items.filter((item) => item.source_type !== "habit");
  const habitsDone = habitItems.filter((item) => item.status === "done").length;
  const tasksDone = taskItems.filter((item) => item.status === "done").length;
  const doneCount = items.filter((item) => item.status === "done").length;

  const completion = computeCompletion(items);
  const preview = topUndoneItems(items);

  return (
    <div className="dp-section">
      <div className="dp-section-head">
        <h2 className="dp-section-title">Today's Snapshot</h2>
        <Link to={ROUTES.PLAN} className="dp-section-link">Open today's plan →</Link>
      </div>

      <div className="dp-stats">
        <div className="dp-stat dp-stat--success">
          <span className="dp-stat-val">{tasksDone}/{taskItems.length}</span>
          <div className="dp-stat-text">
            <span className="dp-stat-name">Tasks Done</span>
            <span className="dp-stat-hint">today's targets</span>
          </div>
        </div>
        <div className="dp-stat dp-stat--info">
          <span className="dp-stat-val">{habitsDone}/{habitItems.length}</span>
          <div className="dp-stat-text">
            <span className="dp-stat-name">Habits Done</span>
            <span className="dp-stat-hint">tracked today</span>
          </div>
        </div>
        <div className="dp-stat dp-stat--warn">
          <span className="dp-stat-val">🔥 {currentStreak}</span>
          <div className="dp-stat-text">
            <span className="dp-stat-name">Current Streak</span>
            <span className="dp-stat-hint">consecutive days</span>
          </div>
        </div>
        <div className="dp-stat dp-stat--brand">
          <span className="dp-stat-val">{latestAlignmentScore}%</span>
          <div className="dp-stat-text">
            <span className="dp-stat-name">Alignment</span>
            <span className="dp-stat-hint">from yesterday's report</span>
          </div>
        </div>
      </div>

      <div className="dp-today-grid">
        <div className="dp-today-list">
          {preview.length === 0 ? (
            <div className="dp-today-empty">
              {items.length === 0 ? (
                <>
                  <span className="dp-today-empty-icon" aria-hidden="true">📭</span>
                  <p className="dp-today-empty-title">Nothing planned for today</p>
                  <p className="dp-today-empty-sub">Add a task or habit to get started.</p>
                </>
              ) : (
                <>
                  <span className="dp-today-empty-icon" aria-hidden="true">🎉</span>
                  <p className="dp-today-empty-title">All done, great work!</p>
                  <p className="dp-today-empty-sub">You've completed everything on your list. Keep it up!</p>
                </>
              )}
            </div>
          ) : (
            preview.map((item) => {
              const isMetric = item.planner_type === "metric";
              const target = item.planner_target ?? 0;
              const pct = isMetric && target > 0
                ? Math.min(100, Math.round((item.current_value / target) * 100))
                : 0;
              const label = timeLabel(item, timeFormat);

              return (
                <div key={item.plan_id} className="dp-today-item">
                  <span className="dp-today-item-dot" style={{ background: PRIORITY_COLOR[item.priority] }} />
                  <div className="dp-today-item-body">
                    <div className="dp-today-item-row1">
                      <div className="dp-today-item-row1-left">
                        <span className="dp-today-item-title">{item.title}</span>
                        {label && <TimeChip preferredTime={item.preferred_time} label={label} />}
                      </div>
                      {item.current_streak >= 1 && (
                        <span className="dp-today-item-streak">🔥 {item.current_streak}</span>
                      )}
                    </div>
                    {(isMetric || item.goal_summary) && (
                      <div className="dp-today-item-row2">
                        {isMetric ? (
                          <>
                            <span className="dp-today-item-progress-label">{remainingLabel(item)}</span>
                            <div className="dp-today-item-bar">
                              <div className="dp-today-item-bar-fill" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="dp-today-item-progress-pct">{pct}%</span>
                          </>
                        ) : (
                          <span className="dp-today-item-subtitle">{item.goal_summary}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="dp-today-ring-panel">
          <ProgressRing percentage={completion} />
          <h3>{doneCount} of {items.length} done</h3>
          <p>{completionMessage(completion)}</p>
        </div>
      </div>
    </div>
  );
}
