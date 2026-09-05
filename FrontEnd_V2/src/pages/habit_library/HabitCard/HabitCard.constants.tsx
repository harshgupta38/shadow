import { ArrowDownRight, ArrowUpRight, DashLg } from "react-bootstrap-icons";

import type { HabitDataResponse } from "@/api";
import { FREQUENCY_OPTIONS, PREFERRED_TIME_OPTIONS } from "@/pages/habit_library/HabitWizard/HabitWizard.constants";

export function PriorityIcon({ priority }: { priority: HabitDataResponse["priority"] }) {
  if (priority === "highest" || priority === "high") return <ArrowUpRight size={11} />;
  if (priority === "low" || priority === "lowest") return <ArrowDownRight size={11} />;
  return <DashLg size={11} />;
}

// Static lookup maps — built once at module load from constants.
export const frequencyLabelMap = new Map(FREQUENCY_OPTIONS.map((o) => [o.value, o.label]));

// ── Helpers ──────────────────────────────────────────────────────────────────

export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

export function formatStatusLabel(status: HabitDataResponse["status"]): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function formatHabitDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function getHabitDateLabel(habit: HabitDataResponse): string | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (habit.start_date) {
    const startDate = new Date(`${habit.start_date}T00:00:00`);
    if (!Number.isNaN(startDate.getTime()) && startDate >= today) {
      return `Starts ${formatHabitDate(habit.start_date)}`;
    }
  }

  return habit.end_date ? `Ends ${formatHabitDate(habit.end_date)}` : null;
}

export function getPreferredTimeLabel(habit: HabitDataResponse): string | null {
  if (habit.preferred_time === "flexible") return null;
  if (habit.preferred_time === "custom") {
    const t = habit.specific_time?.trim();
    return t ? `${t} hrs` : null;
  }
  const option = PREFERRED_TIME_OPTIONS.find((item) => item.value === habit.preferred_time);
  return option?.label.split(" (")[0] ?? habit.preferred_time;
}

export function getPrimaryFrequencyLabel(frequencies: string[]): string {
  if (frequencies.length === 0) return "Flexible";
  return frequencyLabelMap.get(frequencies[0]) ?? frequencies[0];
}

// ── Metric frequency label ────────────────────────────────────────────────────

const NAMED_DAYS = new Set(["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]);

const DAY_SHORT: Record<string, string> = {
  sunday: "Sun", monday: "Mon", tuesday: "Tue", wednesday: "Wed",
  thursday: "Thu", friday: "Fri", saturday: "Sat",
};

function joinWithAmpersand(items: string[]): string {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} & ${items[items.length - 1]}`;
}

interface FrequencySource {
  frequencies: string[];
  weekly_count: number | null;
  monthly_count: number | null;
  specific_days: number[] | null;
}

export function getSimpleFrequencyLabel(habit: FrequencySource): {
  suffix: string;
  tooltip: string[] | null;
} {
  const freqs = habit.frequencies;

  if (!freqs.length) return { suffix: "daily", tooltip: null };
  if (freqs.includes("daily")) return { suffix: "daily", tooltip: null };

  const hasFirst = freqs.includes("first_of_month");
  const hasEnd   = freqs.includes("end_of_month");
  if (hasFirst && hasEnd) return { suffix: "first & last of month", tooltip: null };
  if (hasFirst)           return { suffix: "first of month",        tooltip: null };
  if (hasEnd)             return { suffix: "end of month",          tooltip: null };

  if (freqs.includes("weekdays")) return { suffix: "on weekdays", tooltip: null };
  if (freqs.includes("weekends")) return { suffix: "on weekends", tooltip: null };
  if (freqs.includes("weekly"))   return { suffix: habit.weekly_count  ? `${habit.weekly_count}×/week`   : "weekly",  tooltip: null };
  if (freqs.includes("monthly"))  return { suffix: habit.monthly_count ? `${habit.monthly_count}×/month` : "monthly", tooltip: null };

  if (freqs.includes("specific_day") && habit.specific_days?.length) {
    const days = [...habit.specific_days].sort((a, b) => a - b);
    if (days.length <= 3) {
      return { suffix: `${joinWithAmpersand(days.map(ordinal))} of month`, tooltip: null };
    }
    return { suffix: `${days.length} days/month`, tooltip: days.map(ordinal) };
  }

  const namedDays = freqs.filter((f) => NAMED_DAYS.has(f));
  if (namedDays.length > 0) {
    if (namedDays.length <= 3) {
      return { suffix: `every ${joinWithAmpersand(namedDays.map((d) => DAY_SHORT[d] ?? d))}`, tooltip: null };
    }
    return { suffix: `${namedDays.length}×/week`, tooltip: null };
  }

  return { suffix: "daily", tooltip: null };
}

export function getMetricFrequencyLabel(habit: FrequencySource): {
  suffix: string;
  tooltip: string[] | null;
} {
  const freqs = habit.frequencies;
  const fallback = { suffix: "/ day", tooltip: null };

  if (!freqs.length) return fallback;
  if (freqs.includes("daily")) return { suffix: "/ day", tooltip: null };

  const hasFirst = freqs.includes("first_of_month");
  const hasEnd   = freqs.includes("end_of_month");
  if (hasFirst && hasEnd) return { suffix: "first & last of month", tooltip: null };
  if (hasFirst)           return { suffix: "on month start",        tooltip: null };
  if (hasEnd)             return { suffix: "on month end",          tooltip: null };

  if (freqs.includes("weekdays")) return { suffix: "on weekdays", tooltip: null };
  if (freqs.includes("weekends")) return { suffix: "on weekends", tooltip: null };
  if (freqs.includes("weekly"))   return { suffix: habit.weekly_count  ? `${habit.weekly_count}×/week`   : "weekly",  tooltip: null };
  if (freqs.includes("monthly"))  return { suffix: habit.monthly_count ? `${habit.monthly_count}×/month` : "monthly", tooltip: null };

  if (freqs.includes("specific_day") && habit.specific_days?.length) {
    const days = [...habit.specific_days].sort((a, b) => a - b);
    if (days.length < 4) {
      return { suffix: `${joinWithAmpersand(days.map(ordinal))} of month`, tooltip: null };
    }
    return { suffix: `${days.length} days/month`, tooltip: days.map(ordinal) };
  }

  const namedDays = freqs.filter((f) => NAMED_DAYS.has(f));
  if (namedDays.length > 0) {
    if (namedDays.length <= 3) {
      return { suffix: `every ${joinWithAmpersand(namedDays.map((d) => DAY_SHORT[d] ?? d))}`, tooltip: null };
    }
    return { suffix: `${namedDays.length}×/week`, tooltip: null };
  }

  return fallback;
}

export function ChipTooltip({
  label,
  items,
  children,
}: {
  label: string;
  items: string[];
  children: React.ReactNode;
}) {
  return (
    <span className="hl-chip-tooltip-host">
      {children}
      <span className="hl-chip-tooltip" role="tooltip">
        <span className="hl-chip-tooltip-label">{label}</span>
        {items.map((item) => (
          <span key={item} className="hl-chip-tooltip-item">{item}</span>
        ))}
      </span>
    </span>
  );
}
