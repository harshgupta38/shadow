import { useMemo } from "react";

import { useDateFormat } from "@/context/PlannerContext";
import { formatDisplayDateShort } from "@/services/date.service";
import { shiftIso } from "./WeeklyInsights.constants";

export interface WeekLabels {
  /** Day-of-month under each Sun–Sat column, e.g. "21". */
  dayNumbers: string[];
  /** Full short date per day in the user's date format, e.g. "21 October". */
  dayDates: string[];
  /** Saturday that ended the week `weeksBack` weeks before this one. */
  weekEnding: (weeksBack: number) => string;
}

// weekEnd is the Saturday the report is dated; index 0 is the Sunday six days earlier.
export function useWeekLabels(weekEnd: string): WeekLabels {
  const dateFormat = useDateFormat();

  return useMemo(() => {
    const isos = Array.from({ length: 7 }, (_, i) => shiftIso(weekEnd, i - 6));
    return {
      dayNumbers: isos.map((iso) => String(Number(iso.slice(8)))),
      dayDates: isos.map((iso) => formatDisplayDateShort(iso, dateFormat)),
      weekEnding: (weeksBack) => formatDisplayDateShort(shiftIso(weekEnd, -7 * weeksBack), dateFormat),
    };
  }, [weekEnd, dateFormat]);
}
