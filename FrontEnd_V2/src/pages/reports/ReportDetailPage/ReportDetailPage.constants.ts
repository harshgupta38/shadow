import type { DailyReportDetail } from "@/api/types";

export function ringColor(pct: number): string {
  if (pct >= 75) return "var(--jv-success)";
  if (pct >= 50) return "var(--jv-brand-1)";
  return "var(--jv-warn)";
}

export function fmtTime(iso: string): string {
  const normalized = iso.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(iso) ? iso : iso + "Z";
  return new Date(normalized).toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata",
  });
}

export const CLOSING_EMOJI: Record<DailyReportDetail["closing"]["tone"], string> = {
  celebrate: "🎉",
  motivate: "💪",
  guide: "🧭",
};
