import type React from "react";

import type { PlanStatus } from "@/api";

// ── Constants ─────────────────────────────────────────────────────────────────

export const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// ── Types ─────────────────────────────────────────────────────────────────────

export type CellStatus = PlanStatus | "none" | "future" | "empty" | "off";

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

const DOW_MAP: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

export function isScheduledDay(
  date: Date,
  frequencies: string[],
  specificDays: number[] | null,
): boolean {
  if (!frequencies.length || frequencies.includes("daily")) return true;

  const dow = date.getDay();
  const dom = date.getDate();

  for (const freq of frequencies) {
    if (freq === "weekdays" && dow >= 1 && dow <= 5) return true;
    if (freq === "weekends" && (dow === 0 || dow === 6)) return true;
    if (DOW_MAP[freq] === dow) return true;
    if (freq === "weekly" || freq === "monthly") return true;
    if (freq === "first_of_month" && dom === 1) return true;
    if (freq === "end_of_month") {
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      if (dom === lastDay) return true;
    }
    if (freq === "specific_day" && specificDays?.includes(dom)) return true;
  }
  return false;
}

export function getCellClass(cell: DayCell, plannerType: "simple" | "metric"): string {
  if (!cell.day) return "hh-cell hh-cell--empty";
  const hasValue = plannerType === "metric" && (cell.ratio ?? 0) > 0;
  if (hasValue && (cell.status === "done" || cell.status === "due")) {
    return "hh-cell"; // color applied via inline style
  }
  if (cell.status === "done") return "hh-cell hh-cell--done";
  if (cell.status === "future" || cell.status === "off") return "hh-cell hh-cell--future";
  return "hh-cell hh-cell--blank";
}

export function getCellStyle(cell: DayCell, plannerType: "simple" | "metric"): React.CSSProperties | undefined {
  if (plannerType !== "metric" || !cell.ratio) return undefined;
  if (cell.status !== "done" && cell.status !== "due") return undefined;
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
  frequencies: string[],
  specificDays: number[] | null,
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
      const scheduled = isScheduledDay(new Date(year, month, d), frequencies, specificDays);
      status = scheduled ? "none" : "off";
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
  if (status === "off") return `${label} — not scheduled`;
  if ((status === "done" || status === "due") && ratio != null && ratio > 0) return `${label} — ${Math.round(ratio * 100)}%`;
  return `${label} — ${status}`;
}
