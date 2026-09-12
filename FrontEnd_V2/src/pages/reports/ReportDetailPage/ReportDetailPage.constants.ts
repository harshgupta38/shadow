import type { DailyReportDetail, TimeFormat } from "@/api/types";
import { parseServerDate } from "@/services/date.service";

export function ringColor(pct: number): string {
  if (pct >= 75) return "var(--jv-success)";
  if (pct >= 50) return "var(--jv-brand-1)";
  return "var(--jv-warn)";
}

export function fmtTime(iso: string, format: TimeFormat = "12h"): string {
  return parseServerDate(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit", hour12: format === "12h", timeZone: "Asia/Kolkata",
  });
}

export const CLOSING_EMOJI: Record<DailyReportDetail["closing"]["tone"], string> = {
  celebrate: "🎉",
  motivate: "💪",
  guide: "🧭",
};
