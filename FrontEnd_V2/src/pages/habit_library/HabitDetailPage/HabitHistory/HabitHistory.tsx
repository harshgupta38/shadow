import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "react-bootstrap-icons";

import type { HabitActivityRecord, HabitDataResponse } from "@/api";

import "./HabitHistory.scss";

const MONTH_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

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

function MetricContent({ record, habit }: { record: HabitActivityRecord; habit: HabitDataResponse }) {
  const value = record.value ?? 0;
  const target = habit.planner_target ?? 1;
  const pct = Math.round(Math.min(100, (value / target) * 100));
  const unit = habit.value_unit ?? "";
  const valueLabel = `${value}${unit ? ` ${unit}` : ""}`;

  return (
    <div className="hhs-content hhs-content--metric">
      <p className="hhs-note">{record.note ?? "Progress"}</p>
      <div className="hhs-metric-main">
        <div className="hhs-progress-row">
          <span className="hhs-progress-val">{valueLabel}</span>
          <div className="hhs-progress-track">
            <div className="hhs-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="hhs-progress-pct">{pct}%</span>
        </div>
        <StreakPill streak={record.streak} />
      </div>
    </div>
  );
}

// ── Month section ─────────────────────────────────────────────────────────────

function MonthSection({
  group,
  habit,
  expanded,
  onToggle,
}: {
  group: MonthGroup;
  habit: HabitDataResponse;
  expanded: boolean;
  onToggle: () => void;
}) {
  const plannerType = habit.planner_type;
  const entries = plannerType === "metric"
    ? group.records.filter((r) => !!r.note || (r.value !== null && r.value > 0))
    : group.records.filter((r) => !!r.note);

  if (entries.length === 0) return null;

  return (
    <div className="hl-card hhs-month-group">
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
          <div className="hhs-timeline">
            {entries.map((record) => (
              <div key={record.date} className="hhs-item">
                <div className="hhs-ball">{Number(record.date.slice(8, 10))}</div>
                {plannerType === "simple"
                  ? <SimpleContent record={record} />
                  : <MetricContent record={record} habit={habit} />
                }
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface HabitHistoryProps {
  habit: HabitDataResponse;
  records: HabitActivityRecord[];
}

export function HabitHistory({ habit, records }: HabitHistoryProps) {
  const [openKey, setOpenKey] = useState<string>("");

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
              expanded={openKey === key}
              onToggle={() => setOpenKey((prev) => (prev === key ? "" : key))}
            />
          );
        })}
      </div>
    </div>
  );
}
