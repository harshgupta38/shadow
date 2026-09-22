import { useSearchParams } from "react-router-dom";

import { todayIso } from "@/services/date.service";

/**
 * Persists a "YYYY-MM" month anchor in the URL (`?month=`) instead of plain
 * component state, so navigating away (e.g. to create/edit a sub-page) and
 * back returns to the month the user was on, rather than resetting to the
 * current month on remount.
 */
export function useMonthParam(paramName = "month") {
  const [searchParams, setSearchParams] = useSearchParams();

  const raw = searchParams.get(paramName);
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth();

  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split("-").map(Number);
    if (m >= 1 && m <= 12) {
      year = y;
      month = m - 1;
    }
  }

  function setMonth(nextYear: number, nextMonth: number) {
    const next = new URLSearchParams(searchParams);
    next.set(paramName, `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}`);
    setSearchParams(next, { replace: true });
  }

  return { year, month, setMonth };
}

/**
 * Same idea as `useMonthParam` but for a single "YYYY-MM-DD" date anchor
 * (`?date=`), e.g. for pages that page through individual days.
 */
export function useDateParam(paramName = "date") {
  const [searchParams, setSearchParams] = useSearchParams();

  const raw = searchParams.get(paramName);
  const iso = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : todayIso();

  function setDate(nextIso: string) {
    const next = new URLSearchParams(searchParams);
    next.set(paramName, nextIso);
    setSearchParams(next, { replace: true });
  }

  return { iso, setDate };
}
