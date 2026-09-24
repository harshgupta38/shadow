import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "react-bootstrap-icons";

import type { HabitActivityRecord } from "@/api";
import { todayIso } from "@/services/date.service";
import { GEOMETRY } from "@/constant/tuning";

import "./HabitHistory.scss";

const MONTH_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface PlannerConfig {
  planner_type: "simple" | "metric";
  planner_target: number | null;
  value_unit: string | null;
}

interface MonthGroup {
  year: number;
  month: number;
  records: HabitActivityRecord[];
}

// ── Content components ────────────────────────────────────────────────────────

function StreakPill({ streak }: { streak: number }) {
  if (streak <= 0) return null;
  return <span className="plan-card-streak hhs-streak">🔥 {streak}</span>;
}

function SimpleContent({ record }: { record: HabitActivityRecord }) {
  return (
    <div className="hhs-content hhs-content--simple">
      {record.note && <p className="hhs-note">{record.note}</p>}
      <StreakPill streak={record.streak} />
    </div>
  );
}

// ── Shared month stats footer (done/missed/best-streak for simple habits,
// avg/best/total for metric) — same visual language either way.

function StatsFooter({ stats }: { stats: { value: string; unit?: string; key: string }[] }) {
  return (
    <div className="hhs-stats-footer">
      {stats.map((s, i) => (
        <div key={s.key} className="hhs-stat-group">
          {i > 0 && <div className="hhs-stat-sep" />}
          <div className="hhs-stat">
            <span className="hhs-stat-val">{s.value}{s.unit && <em> {s.unit}</em>}</span>
            <span className="hhs-stat-key">{s.key}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Simple-habit month view — the day list was mostly noise (a ball and a
// flame with no real information; the heatmap above already shows the
// done/missed pattern). Lead with month stats, then only list days that have
// an actual note — the list becomes "why", the heatmap stays "what".

function SimpleMonthTimeline({ records }: { records: HabitActivityRecord[] }) {
  const notedEntries = useMemo(() => records.filter((r) => !!r.note), [records]);
  const doneCount = useMemo(() => records.filter((r) => r.status === "done").length, [records]);
  const missedCount = useMemo(() => records.filter((r) => r.status === "missed").length, [records]);
  const bestStreak = useMemo(() => Math.max(0, ...records.map((r) => r.streak)), [records]);

  return (
    <div className="hhs-simple-month">
      {notedEntries.length === 0 ? (
        <p className="hhs-simple-empty">No notes logged this month.</p>
      ) : (
        <div className="hhs-timeline">
          {notedEntries.map((record) => (
            <div key={record.date} className="hhs-item">
              <div className="hhs-ball">{Number(record.date.slice(8, 10))}</div>
              <SimpleContent record={record} />
            </div>
          ))}
        </div>
      )}

      <StatsFooter
        stats={[
          { value: String(doneCount), key: "done" },
          { value: String(missedCount), key: "missed" },
          { value: String(bestStreak), key: "best streak" },
        ]}
      />
    </div>
  );
}

// ── Monthly metric chart — replaces the day-by-day list for metric habits/tasks:
// a full month of daily values is easier to read as a trend than 28-31 rows.

interface MonthlyMetricPoint {
  day: number;
  value: number;
  target: number;
  streak: number;
  note: string | null;
}

function buildMonthlyMetricPoints(
  monthRecords: HabitActivityRecord[],
  year: number,
  month: number,
  today: string,
  fallbackTarget: number,
): MonthlyMetricPoint[] {
  // monthRecords is already scoped to this {year, month} by the caller
  // (HabitHistory's recordsByMonth map) — no need to re-check each date.
  const recordByDay = new Map<number, HabitActivityRecord>();
  for (const r of monthRecords) {
    recordByDay.set(Number(r.date.slice(8, 10)), r);
  }

  const [ty, tm, td] = today.split("-").map(Number);
  const isCurrentMonth = ty === year && tm - 1 === month;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const lastDay = isCurrentMonth ? Math.min(td, daysInMonth) : daysInMonth;

  const monthTargets: Array<number | null> = Array.from({ length: lastDay }, () => null);
  for (let day = 1; day <= lastDay; day++) {
    const row = recordByDay.get(day);
    if (row && row.planner_target != null && row.planner_target > 0) {
      monthTargets[day - 1] = row.planner_target;
    }
  }

  let carryTarget: number | null = null;
  for (let i = 0; i < monthTargets.length; i++) {
    if (monthTargets[i] != null) {
      carryTarget = monthTargets[i];
      continue;
    }
    if (carryTarget != null) {
      monthTargets[i] = carryTarget;
    }
  }

  carryTarget = null;
  for (let i = monthTargets.length - 1; i >= 0; i--) {
    if (monthTargets[i] != null) {
      carryTarget = monthTargets[i];
      continue;
    }
    if (carryTarget != null) {
      monthTargets[i] = carryTarget;
    }
  }

  const points: MonthlyMetricPoint[] = [];
  for (let day = 1; day <= lastDay; day++) {
    const r = recordByDay.get(day);
    points.push({
      day,
      value: r?.value ?? 0,
      target: monthTargets[day - 1] ?? Math.max(0, fallbackTarget),
      streak: r?.streak ?? 0,
      note: r?.note ?? null,
    });
  }
  return points;
}

// Fixed, generous chart height in real pixels. The viewBox width tracks the
// container's *measured* pixel width (via ResizeObserver) rather than a fixed
// constant — with preserveAspectRatio="none", a viewBox narrower than the
// actual render box stretches everything (bars, gridlines, text) horizontally
// while leaving the vertical scale untouched, which is what was flattening
// the chart. Matching the viewBox to the real box 1:1 removes that distortion.
const CHART_H = GEOMETRY.HABIT_HISTORY_CHART_HEIGHT;
const CHART_PAD_TOP = GEOMETRY.HABIT_HISTORY_CHART_PAD_TOP;
const CHART_PAD_BOTTOM = GEOMETRY.HABIT_HISTORY_CHART_PAD_BOTTOM;
const GRID_LINES = [0, 0.33, 0.66, 1];
const MIN_CHART_W = GEOMETRY.HABIT_HISTORY_MIN_CHART_WIDTH;
const MIN_DAY_PX = GEOMETRY.HABIT_HISTORY_MIN_DAY_PX;

function useMeasuredWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, width: Math.max(width, MIN_CHART_W) };
}

function MetricMonthChart({
  monthRecords,
  habit,
  year,
  month,
  today,
}: {
  monthRecords: HabitActivityRecord[];
  habit: PlannerConfig;
  year: number;
  month: number;
  today: string;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const { ref: plotRef, width: chartW } = useMeasuredWidth(600);

  const points = useMemo(
    () => buildMonthlyMetricPoints(monthRecords, year, month, today, habit.planner_target ?? 0),
    [monthRecords, year, month, today, habit.planner_target],
  );

  const unit = habit.value_unit ?? "";
  const values = points.map((p) => p.value);
  const targets = points.map((p) => p.target);
  const max = Math.max(...values, ...targets, 1);

  const plotH = CHART_H - CHART_PAD_TOP - CHART_PAD_BOTTOM;
  const baseY = CHART_H - CHART_PAD_BOTTOM;
  const slot = chartW / points.length;
  const gap = Math.min(10, slot * 0.32);
  const barW = Math.max(2, slot - gap);

  const bars = points.map((p, i) => {
    const x = i * slot + gap / 2;
    const h = max > 0 ? (p.value / max) * plotH : 0;
    const y = baseY - h;
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
    return { ...p, x, y, h, slotX: i * slot, isToday: dateStr === today };
  });

  const hovered = hoverIdx != null ? bars[hoverIdx] : null;
  const tooltipLeftPct = hovered
    ? Math.min(94, Math.max(6, ((hovered.x + barW / 2) / chartW) * 100))
    : 0;

  const nonZero = values.filter((v) => v > 0);
  const avg = nonZero.length > 0 ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length : 0;
  const best = Math.max(...values, 0);
  const total = values.reduce((a, b) => a + b, 0);

  return (
    <div className="hhs-chart" onMouseLeave={() => setHoverIdx(null)}>
      <div className="hhs-chart-scroll">
        <div className="hhs-chart-plot" ref={plotRef} style={{ minWidth: points.length * MIN_DAY_PX }}>
        <svg
          viewBox={`0 0 ${chartW} ${CHART_H}`}
          className="hhs-chart-svg"
          preserveAspectRatio="none"
          aria-label={`${MONTH_FULL[month]} daily values`}
        >
          <defs>
            <linearGradient id={`hhs-bar-grad-${year}-${month}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--jv-brand-1)" />
              <stop offset="100%" stopColor="var(--jv-brand-2)" />
            </linearGradient>
          </defs>

          {GRID_LINES.map((f) => {
            const y = CHART_PAD_TOP + f * plotH;
            return <line key={f} x1="0" y1={y} x2={chartW} y2={y} className="hhs-chart-grid" />;
          })}

          {bars.map((b) => {
            if (b.target <= 0) return null;
            const y = baseY - (b.target / max) * plotH;
            return (
              <line
                key={`target-${b.day}`}
                x1={b.slotX}
                y1={y.toFixed(1)}
                x2={b.slotX + slot}
                y2={y.toFixed(1)}
                className="hhs-chart-target"
              />
            );
          })}

          {bars.map((b, i) => (
            <g
              key={b.day}
              onMouseEnter={() => setHoverIdx(i)}
              onFocus={() => setHoverIdx(i)}
              tabIndex={0}
              role="img"
              aria-label={`${MONTH_FULL[month].slice(0, 3)} ${b.day} — ${b.value}${unit ? ` ${unit}` : ""}`}
            >
              {/* Full-height hit area — hovering anywhere in the day's slot highlights its bar */}
              <rect x={b.slotX} y="0" width={slot} height={baseY} className={`hhs-chart-hit${hoverIdx === i ? " is-hover" : ""}`} />
              <rect
                x={b.x}
                y={b.y}
                width={barW}
                height={Math.max(b.h, 3)}
                rx="6"
                fill={`url(#hhs-bar-grad-${year}-${month})`}
                className={`hhs-bar${hoverIdx === i ? " is-hover" : ""}${b.isToday ? " is-today" : ""}`}
              />
              {b.value > 0 && (
                <text x={b.x + barW / 2} y={b.y - 10} textAnchor="middle" className="hhs-bar-label">
                  {b.value}
                </text>
              )}
              <text x={b.x + barW / 2} y={CHART_H - 9} textAnchor="middle" className="hhs-bar-day">
                {b.day}
              </text>
            </g>
          ))}
        </svg>

        {hovered && (
          <div className="hhs-chart-tooltip" style={{ left: `${tooltipLeftPct}%` }}>
            <div className="hhs-chart-tooltip-title">
              {MONTH_FULL[month].slice(0, 3)} {hovered.day}
              {hovered.streak > 0 && (
                <span className="hhs-chart-tooltip-streak">🔥 {hovered.streak}</span>
              )}
            </div>
            <div className="hhs-chart-tooltip-row">
              <span className="hhs-chart-tooltip-dot" />
              {hovered.value}{unit ? ` ${unit}` : ""}
            </div>
            {hovered.target > 0 && (
              <div className="hhs-chart-tooltip-sub">Target: {hovered.target}{unit ? ` ${unit}` : ""}</div>
            )}
            {hovered.note && (
              <div className="hhs-chart-tooltip-note">{hovered.note}</div>
            )}
          </div>
        )}
        </div>
      </div>

      <StatsFooter
        stats={[
          { value: avg.toFixed(1), unit, key: "avg" },
          { value: String(best), unit, key: "best" },
          { value: String(total), unit, key: "total" },
        ]}
      />
    </div>
  );
}

// ── Month section ─────────────────────────────────────────────────────────────

function MonthSection({
  group,
  habit,
  monthRecords,
  today,
  expanded,
  onToggle,
}: {
  group: MonthGroup;
  habit: PlannerConfig;
  monthRecords: HabitActivityRecord[];
  today: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const plannerType = habit.planner_type;
  const entries = plannerType === "metric"
    ? group.records.filter((r) => !!r.note || (r.value !== null && r.value > 0))
    : group.records.filter((r) => !!r.note || r.status === "done");

  if (entries.length === 0) return null;

  return (
    <div className={`hl-card hhs-month-group ${expanded ? "pb-3" : ""}`}>
      <button
        type="button"
        className="hhs-month-header"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <h3 className="hhs-month-label">
          {MONTH_FULL[group.month]}, {group.year}
        </h3>
        <span className="hhs-chevron" aria-hidden="true">
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </span>
      </button>

      <div className={`hhs-collapse${expanded ? " is-expanded" : ""}`}>
        <div className={`hhs-collapse-inner${expanded ? "" : " is-collapsed"}`}>
          {plannerType === "metric" ? (
            <MetricMonthChart
              monthRecords={monthRecords}
              habit={habit}
              year={group.year}
              month={group.month}
              today={today}
            />
          ) : (
            <SimpleMonthTimeline records={group.records} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface HabitHistoryProps {
  habit: PlannerConfig;
  records: HabitActivityRecord[];
}

export function HabitHistory({ habit, records }: HabitHistoryProps) {
  const today = useMemo(() => todayIso(), []);

  const monthGroups = useMemo<MonthGroup[]>(() => {
    const map = new Map<string, MonthGroup>();
    for (const r of records) {
      if (r.status === "due" && (habit.planner_type !== "metric" || (r.value ?? 0) === 0)) continue;
      const d = new Date(`${r.date}T00:00:00`);
      const year = d.getFullYear();
      const month = d.getMonth();
      const key = `${year}-${month}`;
      if (!map.has(key)) map.set(key, { year, month, records: [] });
      map.get(key)!.records.push(r);
    }
    for (const group of map.values()) {
      group.records.sort((a, b) => b.date.localeCompare(a.date));
    }
    return [...map.values()].sort((a, b) => b.year - a.year || b.month - a.month);
  }, [records]);

  // Most recent month starts expanded — HabitHistory only mounts after the
  // parent's data has already loaded, so monthGroups is populated by the
  // time this runs. Plain state after that: the user's own toggles win.
  const [openKey, setOpenKey] = useState<string>(
    () => (monthGroups.length > 0 ? `${monthGroups[0].year}-${monthGroups[0].month}` : ""),
  );

  // Unfiltered per-month grouping (single O(n) pass) for MetricMonthChart —
  // it needs every record, including zero-value/note-only days that
  // monthGroups above deliberately drops, to zero-fill the chart correctly.
  // Kept separate from monthGroups so each month section doesn't rescan the
  // full record history on every render.
  const recordsByMonth = useMemo(() => {
    const map = new Map<string, HabitActivityRecord[]>();
    for (const r of records) {
      const [year, month] = r.date.split("-").map(Number);
      const key = `${year}-${month - 1}`;
      let arr = map.get(key);
      if (!arr) { arr = []; map.set(key, arr); }
      arr.push(r);
    }
    return map;
  }, [records]);

  if (monthGroups.length === 0) return null;

  return (
    <div className="hhs-card mt-3">
      <div className="hhs-body">
        {monthGroups.map((group) => {
          const key = `${group.year}-${group.month}`;
          return (
            <MonthSection
              key={key}
              group={group}
              habit={habit}
              monthRecords={recordsByMonth.get(key) ?? []}
              today={today}
              expanded={openKey === key}
              onToggle={() => setOpenKey((prev) => (prev === key ? "" : key))}
            />
          );
        })}
      </div>
    </div>
  );
}
