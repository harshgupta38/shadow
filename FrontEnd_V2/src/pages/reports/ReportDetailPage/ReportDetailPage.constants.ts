import type { DailyReportDetail } from "@/api/types";

export function ringColor(pct: number): string {
  if (pct >= 75) return "var(--jv-success)";
  if (pct >= 50) return "var(--jv-brand-1)";
  return "var(--jv-warn)";
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

export const CLOSING_EMOJI: Record<DailyReportDetail["closing"]["tone"], string> = {
  celebrate: "🎉",
  motivate: "💪",
  guide: "🧭",
};
