import type React from "react";

import type { PlanStatus } from "@/api";

// ── Constants ─────────────────────────────────────────────────────────────────

export const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// ── Types ─────────────────────────────────────────────────────────────────────

export type CellStatus = PlanStatus | "none" | "future" | "empty";

export interface RecordEntry {
  status: PlanStatus;
  value?: number;
}

export interface DayCell {
  day: number | null;
  status: CellStatus;
  dateStr: string;
  ratio?: number; // metric only: 0.0–1.0
}

export interface MonthGrid {
  year: number;
  month: number;
  cells: DayCell[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getCellClass(cell: DayCell, plannerType: "simple" | "metric"): string {
  if (!cell.day) return "hh-cell hh-cell--empty";
  if (plannerType === "metric" && cell.status === "done" && cell.ratio != null && cell.ratio > 0) {
    return "hh-cell"; // color applied via inline style
  }
  if (cell.status === "done") return "hh-cell hh-cell--done";
  if (cell.status === "future") return "hh-cell hh-cell--future";
  return "hh-cell hh-cell--blank";
}

export function getCellStyle(cell: DayCell, plannerType: "simple" | "metric"): React.CSSProperties | undefined {
  if (plannerType !== "metric" || cell.status !== "done" || !cell.ratio) return undefined;
  const pct = Math.max(15, Math.round(cell.ratio * 100));
  return {
    background: `color-mix(in srgb, var(--jv-success) ${pct}%, var(--jv-surface) ${100 - pct}%)`,
  };
}


export function buildGrid(
  year: number,
  month: number,
  recordMap: Map<string, RecordEntry>,
  today: string,
  plannerTarget: number | null,
): MonthGrid {
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: DayCell[] = [];

  for (let i = 0; i < firstDow; i++) {
    cells.push({ day: null, status: "empty", dateStr: "" });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const rec = recordMap.get(dateStr);
    let status: CellStatus;
    let ratio: number | undefined;

    if (rec) {
      status = rec.status;
      if (plannerTarget != null && plannerTarget > 0 && rec.value != null && rec.value > 0) {
        ratio = Math.min(1, rec.value / plannerTarget);
      }
    } else if (dateStr > today) {
      status = "future";
    } else {
      status = "none";
    }

    cells.push({ day: d, status, dateStr, ratio });
  }

  return { year, month, cells };
}

export function cellTitle(dateStr: string, status: CellStatus, ratio?: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const label = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  if (status === "none" || status === "missed") return `${label} — no record`;
  if (status === "future") return label;
  if (status === "done" && ratio != null) return `${label} — ${Math.round(ratio * 100)}%`;
  return `${label} — ${status}`;
}
