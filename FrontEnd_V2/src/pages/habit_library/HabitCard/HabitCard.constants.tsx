import type { HabitDataResponse } from "@/api";
import { FREQUENCY_OPTIONS, PREFERRED_TIME_OPTIONS, PRIORITY_OPTIONS } from "@/pages/habit_library/HabitWizard/HabitWizard.constants";

// Static lookup maps — built once at module load from constants.
export const frequencyLabelMap = new Map(FREQUENCY_OPTIONS.map((o) => [o.value, o.label]));
export const priorityLabelMap = new Map(PRIORITY_OPTIONS.map((o) => [o.value, o.label]));

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
