import type { PlanStatus } from "@/api";

// ── Constants ─────────────────────────────────────────────────────────────────

export const DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ── Types ─────────────────────────────────────────────────────────────────────

export type CellStatus = PlanStatus | "none" | "future" | "empty";

export interface DayCell {
  day: number | null;
  status: CellStatus;
  dateStr: string;
}

export interface MonthGrid {
  year: number;
  month: number;
  cells: DayCell[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function buildGrid(
  year: number,
  month: number,
  recordMap: Map<string, PlanStatus>,
  today: string,
): MonthGrid {
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: DayCell[] = [];

  for (let i = 0; i < firstDow; i++) {
    cells.push({ day: null, status: "empty", dateStr: "" });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    let status: CellStatus;
    if (recordMap.has(dateStr)) {
      status = recordMap.get(dateStr)!;
    } else if (dateStr > today) {
      status = "future";
    } else {
      status = "none";
    }
    cells.push({ day: d, status, dateStr });
  }

  return { year, month, cells };
}

export function cellTitle(dateStr: string, status: CellStatus): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const label = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  if (status === "none") return `${label} — no record`;
  if (status === "future") return label;
  return `${label} — ${status}`;
}
