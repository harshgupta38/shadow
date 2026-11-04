import type { DateFormat } from "@/api";
import { WEEKDAY_LONG } from "@/pages/workout/WorkoutPage.constants";
import { IST_TIMEZONE, formatDisplayDateShort, todayIso } from "@/services/date.service";

/** What a panel calls the day it shows: "Today · Wednesday", or "Monday · 03 November" for another day, such as a past report's. */
export function dayHeading(iso: string, dateFormat: DateFormat): string {
  const weekday = WEEKDAY_LONG[new Date(`${iso}T00:00:00`).getDay()];
  return iso === todayIso() ? `Today · ${weekday}` : `${weekday} · ${formatDisplayDateShort(iso, dateFormat)}`;
}

export function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: IST_TIMEZONE }).format(new Date()),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
