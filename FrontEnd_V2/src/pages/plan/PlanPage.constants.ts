import type { DateFormat } from "@/api";
import { formatDisplayDate as formatIsoDisplayDate, formatDuration } from "@/services/date.service";

export { PRIORITY_LABEL } from "@/constant/priority";
export { formatDuration };

export function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDisplayDate(date: Date, format: DateFormat = "dd mmmm yyyy"): string {
  return formatIsoDisplayDate(toDateInputValue(date), format);
}

export function shiftDate(date: Date, days: number): Date {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}
