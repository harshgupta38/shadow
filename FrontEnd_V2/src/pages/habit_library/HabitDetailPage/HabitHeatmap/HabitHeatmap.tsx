import { useEffect, useMemo, useState } from "react";

import { api } from "@/api";
import type { PlanStatus } from "@/api";
import { todayIso } from "@/services/date.service";

import {
  buildGrid,
  cellTitle,
  DAY_INITIALS,
  MONTH_NAMES,
} from "./HabitHeatmap.constants";
import type { MonthGrid } from "./HabitHeatmap.constants";

import "./HabitHeatmap.scss";

// ── Component ─────────────────────────────────────────────────────────────────

interface HabitHeatmapProps {
  habitId: number;
}

export function HabitHeatmap({ habitId }: HabitHeatmapProps) {
  const [recordMap, setRecordMap] = useState<Map<string, PlanStatus> | null>(null);
  const [fetchError, setFetchError] = useState(false);

  const today = useMemo(() => todayIso(), []);

  useEffect(() => {
    let cancelled = false;
    setRecordMap(null);
    setFetchError(false);
    api.habits
      .getHistory(habitId, { skip: 0, limit: 248 })
      .then((data) => {
        if (cancelled) return;
        const map = new Map<string, PlanStatus>();
        for (const rec of data.records) {
          const dateKey = rec.date.slice(0, 10);
          const status = (rec.item.saved_data?.status ?? "due") as PlanStatus;
          map.set(dateKey, status);
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

    // Always show last 8 months ending at current month
    const anchor = new Date(todayDate);
    anchor.setMonth(anchor.getMonth() - 7);
    let y = anchor.getFullYear();
    let m = anchor.getMonth();

    const grids: MonthGrid[] = [];
    while (y < endYear || (y === endYear && m <= endMonth)) {
      grids.push(buildGrid(y, m, recordMap, today));
      m++;
      if (m > 11) { m = 0; y++; }
    }
    return grids;
  }, [recordMap, today]);

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
                  {MONTH_NAMES[mg.month]} {mg.year}
                </div>
                <div className="hh-dow-row" aria-hidden="true">
                  {DAY_INITIALS.map((l, i) => (
                    <span key={i} className="hh-dow">{l}</span>
                  ))}
                </div>
                <div className="hh-grid" role="grid" aria-label={`${MONTH_NAMES[mg.month]} ${mg.year}`}>
                  {mg.cells.map((cell, i) => (
                    <div
                      key={i}
                      role={cell.day ? "gridcell" : "presentation"}
                      className={`hh-cell hh-cell--${cell.status}`}
                      title={cell.day ? cellTitle(cell.dateStr, cell.status) : undefined}
                      aria-label={cell.day ? cellTitle(cell.dateStr, cell.status) : undefined}
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
