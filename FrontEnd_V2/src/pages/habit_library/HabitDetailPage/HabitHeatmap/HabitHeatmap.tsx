import { useEffect, useMemo, useRef } from "react";

import type { HabitActivityRecord, PlanStatus } from "@/api";
import { todayIso } from "@/services/date.service";

import {
  buildGrid,
  cellTitle,
  getCellClass,
  getCellStyle,
  MONTH_NAMES,
} from "./HabitHeatmap.constants";
import type { MonthGrid, RecordEntry } from "./HabitHeatmap.constants";

import "./HabitHeatmap.scss";

interface PlannerConfig {
  planner_type: "simple" | "metric";
  planner_target: number | null;
  frequencies: string[];
  specific_days: number[] | null;
}

interface HabitHeatmapProps {
  habit: PlannerConfig;
  records: HabitActivityRecord[];
}

export function HabitHeatmap({ habit, records }: HabitHeatmapProps) {
  const plannerType = habit.planner_type as "simple" | "metric";
  const plannerTarget = habit.planner_target ?? null;
  const frequencies = habit.frequencies;
  const specificDays = habit.specific_days;

  const today = useMemo(() => todayIso(), []);
  const scrollRef = useRef<HTMLDivElement>(null);

  const recordMap = useMemo(() => {
    const map = new Map<string, RecordEntry>();
    for (const rec of records) {
      map.set(rec.date, { status: rec.status as PlanStatus, value: rec.value ?? undefined });
    }
    return map;
  }, [records]);

  const months = useMemo<MonthGrid[]>(() => {
    const todayDate = new Date(today);
    const endYear = todayDate.getFullYear();
    const endMonth = todayDate.getMonth();

    const anchor = new Date(todayDate);
    anchor.setDate(1);
    anchor.setMonth(anchor.getMonth() - 11);
    let y = anchor.getFullYear();
    let m = anchor.getMonth();

    const grids: MonthGrid[] = [];
    while (y < endYear || (y === endYear && m <= endMonth)) {
      grids.push(buildGrid(y, m, recordMap, today, plannerTarget, frequencies, specificDays));
      m++;
      if (m > 11) { m = 0; y++; }
    }
    return grids;
  }, [recordMap, today, plannerTarget, frequencies, specificDays]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [months]);

  if (months.length === 0) return null;

  return (
    <div className="hl-card hh-card">
      <div className="hl-card-header">
        <div>
          <h2 className="hl-title">Activity</h2>
        </div>
      </div>

      <div className="hl-card-body hh-body">
        <div className="hh-months-container" ref={scrollRef}>
          <div className="hh-months">
            {months.map((mg) => (
              <div key={`${mg.year}-${mg.month}`} className="hh-month">
                <div className="hh-month-label">
                  {MONTH_NAMES[mg.month]}
                </div>
                <div className="hh-grid" role="grid" aria-label={`${MONTH_NAMES[mg.month]} ${mg.year}`}>
                  {mg.cells.map((cell, i) => (
                    <div
                      key={i}
                      role={cell.day ? "gridcell" : "presentation"}
                      className={getCellClass(cell, plannerType)}
                      style={getCellStyle(cell, plannerType)}
                      title={cell.day ? cellTitle(cell.dateStr, cell.status, cell.ratio) : undefined}
                      aria-label={cell.day ? cellTitle(cell.dateStr, cell.status, cell.ratio) : undefined}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
