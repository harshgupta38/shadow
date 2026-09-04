import { useEffect, useMemo, useState } from "react";

import { api } from "@/api";
import type { HabitDataResponse, PlanStatus } from "@/api";
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

// ── Component ─────────────────────────────────────────────────────────────────

interface HabitHeatmapProps {
  habit: HabitDataResponse;
}

export function HabitHeatmap({ habit }: HabitHeatmapProps) {
  const habitId = habit.id;
  const plannerType = habit.planner_type as "simple" | "metric";
  const plannerTarget = habit.planner_target ?? null;
  const [recordMap, setRecordMap] = useState<Map<string, RecordEntry> | null>(null);
  const [fetchError, setFetchError] = useState(false);

  const today = useMemo(() => todayIso(), []);

  useEffect(() => {
    let cancelled = false;
    setRecordMap(null);
    setFetchError(false);
    api.habits
      .getHistory(habitId, { skip: 0, limit: 366 })
      .then((data) => {
        if (cancelled) return;
        const map = new Map<string, RecordEntry>();
        for (const rec of data.records) {
          const dateKey = rec.date.slice(0, 10);
          const status = (rec.item.saved_data?.status ?? "due") as PlanStatus;
          const value = rec.item.saved_data?.current_value as number | undefined;
          map.set(dateKey, { status, value });
        }
        setRecordMap(map);
      })
      .catch(() => {
        if (!cancelled) setFetchError(true);
      });
    return () => { cancelled = true; };
  }, [habitId]);

  const months = useMemo<MonthGrid[]>(() => {
    if (!recordMap) return [];

    const todayDate = new Date(today);
    const endYear = todayDate.getFullYear();
    const endMonth = todayDate.getMonth();

    const anchor = new Date(todayDate);
    anchor.setMonth(anchor.getMonth() - 11);
    let y = anchor.getFullYear();
    let m = anchor.getMonth();

    const grids: MonthGrid[] = [];
    while (y < endYear || (y === endYear && m <= endMonth)) {
      grids.push(buildGrid(y, m, recordMap, today, plannerTarget));
      m++;
      if (m > 11) { m = 0; y++; }
    }
    return grids;
  }, [recordMap, today, plannerTarget]);

  if (fetchError || !recordMap) return null;
  if (months.length === 0) return null;

  return (
    <div className="hl-card hh-card">
      <div className="hl-card-header">
        <div>
          <h2 className="hl-title">Activity</h2>
        </div>
      </div>

      <div className="hl-card-body hh-body">
        <div className="hh-months-container">
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
