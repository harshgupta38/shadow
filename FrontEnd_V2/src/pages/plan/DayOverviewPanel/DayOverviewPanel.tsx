import {
  ArrowRightShort,
  CalendarX,
  ListTask,
} from "react-bootstrap-icons";

import type { PlanDataResponse, PlanPriority } from "@/api";
import { formatDuration, PRIORITY_LABEL } from "@/pages/plan/PlanPage.constants";
import {
  PRIORITY_ORDER,
  TIME_ORDER,
  activeItems,
  nextUpTimeLabel,
  focusSub,
} from "./DayOverviewPanel.constants";
import "./DayOverviewPanel.scss";

interface Props {
  items: PlanDataResponse[];
  loading: boolean;
  isToday: boolean;
  estimatedMinutes: number;
}

export function DayOverviewPanel({ items, loading, isToday, estimatedMinutes }: Props) {
  const title = isToday ? "Today's Overview" : "Overview";

  if (loading) {
    return (
      <section className="plan-panel overview-panel">
        <div className="overview-header">
          <ListTask size={15} />
          <h2>{title}</h2>
        </div>
        <div className="overview-body">
          {/* Stat row */}
          <div className="overview-top-row">
            <div className="overview-stat">
              <span className="ovsk ovsk-value" />
              <span className="ovsk ovsk-label mt-2" />
            </div>
            <div className="overview-stat">
              <span className="ovsk ovsk-value ovsk-value--wide" />
              <span className="ovsk ovsk-label mt-2" />
            </div>
          </div>
          {/* Section rows */}
          {(["Priority", "Next up", "Primary focus"] as const).map((label) => (
            <div key={label} className="overview-section">
              <span className="overview-section-label">{label}</span>
              <div className="ovsk-row">
                <span className="ovsk ovsk-line" />
                {label === "Next up" && <span className="ovsk ovsk-badge" />}
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="plan-panel overview-panel">
        <div className="overview-header">
          <ListTask size={15} />
          <h2>{title}</h2>
        </div>
        <div className="overview-empty">
          <span className="overview-empty-icon"><CalendarX size={18} /></span>
          <p className="overview-empty-title">No plans for today</p>
          <p className="overview-empty-sub">
            Your recurring tasks and habits will appear here when they&apos;re scheduled.
          </p>
        </div>
      </section>
    );
  }

  const habitCount = items.filter((i) => i.source_type === "habit").length;
  const scheduleCount = items.filter((i) => i.source_type === "schedule").length;
  const taskCount = scheduleCount + items.filter((i) => i.source_type === "task").length;

  const priorityCounts = new Map<PlanPriority, number>();
  for (const item of items) {
    priorityCounts.set(item.priority, (priorityCounts.get(item.priority) ?? 0) + 1);
  }
  const priorityOrder: PlanPriority[] = ["highest", "high", "medium", "low", "lowest"];
  const presentPriorities = priorityOrder.filter((p) => priorityCounts.has(p));

  const active = activeItems(items);

  const nextUp =
    [...active]
      .filter((i) => i.preferred_time !== "flexible")
      .sort((a, b) => TIME_ORDER[a.preferred_time] - TIME_ORDER[b.preferred_time])[0] ?? null;

  const primaryFocus =
    [...active].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])[0] ??
    null;

  const sub = primaryFocus ? focusSub(primaryFocus) : null;

  return (
    <section className="plan-panel overview-panel">
      <div className="overview-header">
        <ListTask size={15} />
        <h2>{title}</h2>
      </div>

      <div className="overview-body">
        {/* ── Top stat row ── */}
        <div className="overview-top-row">
          <div className="overview-stat">
            <span className="overview-stat-value">
              {estimatedMinutes > 0 ? formatDuration(estimatedMinutes) : "—"}
            </span>
            <span className="overview-stat-label">Estimated effort</span>
          </div>

          <div className="overview-stat">
            <span className="overview-stat-value">{items.length} {items.length === 1 ? "Item" : "Items"}</span>
            <span className="overview-stat-label">
              {[
                habitCount > 0 && `${habitCount} habit${habitCount !== 1 ? "s" : ""}`,
                taskCount > 0 && `${taskCount} task${taskCount !== 1 ? "s" : ""}`,
                // scheduleCount > 0 && `${scheduleCount} scheduled`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
        </div>

        {/* ── Priority ── */}
        <div className="overview-section">
          <span className="overview-section-label">Priority</span>
          <div className="overview-priority-row">
            {presentPriorities.map((p) => (
              <span key={p} className={`overview-priority-chip overview-priority-chip--${p}`}>
                {priorityCounts.get(p)} {PRIORITY_LABEL[p]}
              </span>
            ))}
          </div>
        </div>

        {/* ── Next up ── */}
        <div className="overview-section">
          <span className="overview-section-label">Next up</span>
          {nextUp ? (
            <div className="overview-nextup">
              <ArrowRightShort size={16} className="overview-nextup-arrow" />
              <span className="overview-nextup-title">{nextUp.title}</span>
              <span className="overview-nextup-time">{nextUpTimeLabel(nextUp)}</span>
            </div>
          ) : (
            <span className="overview-none">No timed items</span>
          )}
        </div>

        {/* ── Primary focus ── */}
        <div className="overview-section pb-0">
          <span className="overview-section-label">Primary focus</span>
          {primaryFocus ? (
            <div className="overview-focus">
              <span className="overview-focus-title">{primaryFocus.title}</span>
              {sub && <span className="overview-focus-sub">{sub}</span>}
            </div>
          ) : (
            <span className="overview-none">All done — great work!</span>
          )}
        </div>
      </div>
    </section>
  );
}
