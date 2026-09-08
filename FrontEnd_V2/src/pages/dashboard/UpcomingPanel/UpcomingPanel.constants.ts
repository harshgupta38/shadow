import { todayDate } from "@/services/date.service";

// "Today" / "Tomorrow" / "DD Month" for a YYYY-MM-DD date relative to today.
export function fmtUpcomingDate(iso: string): string {
  const today = todayDate();
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  return target.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}
