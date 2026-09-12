import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { type ChildProps, type TimeFormat, type WeekStartsOn } from "@/api";

type PlannerSyncDetail = { week_starts_on: WeekStartsOn; time_format: TimeFormat };

// ── localStorage helpers ──────────────────────────────────────────────────────

function readWeekCache(): WeekStartsOn {
  try {
    const v = localStorage.getItem("shadow_week_start");
    if (v === "monday" || v === "sunday") return v;
  } catch {}
  return "sunday";
}

function readTimeCache(): TimeFormat {
  try {
    const v = localStorage.getItem("shadow_time_fmt");
    if (v === "12h" || v === "24h") return v;
  } catch {}
  return "12h";
}

// ── Context ───────────────────────────────────────────────────────────────────

interface PlannerContextValue {
  weekStartsOn: WeekStartsOn;
  timeFormat: TimeFormat;
}

const PlannerContext = createContext<PlannerContextValue | undefined>(undefined);

export function PlannerProvider({ children }: ChildProps) {
  const [weekStartsOn, setWeekStartsOn] = useState<WeekStartsOn>(readWeekCache);
  const [timeFormat, setTimeFormat] = useState<TimeFormat>(readTimeCache);

  // AuthContext fires planner:sync on session restore, login, register, and refreshUser.
  // SettingsPage fires it after a successful save.
  useEffect(() => {
    function handler(e: Event) {
      const d = (e as CustomEvent<PlannerSyncDetail>).detail;
      setWeekStartsOn(d.week_starts_on);
      setTimeFormat(d.time_format);
      try {
        localStorage.setItem("shadow_week_start", d.week_starts_on);
        localStorage.setItem("shadow_time_fmt", d.time_format);
      } catch {}
    }
    window.addEventListener("planner:sync", handler);
    return () => window.removeEventListener("planner:sync", handler);
  }, []);

  const value = useMemo(() => ({ weekStartsOn, timeFormat }), [weekStartsOn, timeFormat]);

  return <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>;
}

export function useWeekStart(): WeekStartsOn {
  const ctx = useContext(PlannerContext);
  if (!ctx) throw new Error("useWeekStart must be used within a PlannerProvider");
  return ctx.weekStartsOn;
}

export function useTimeFormat(): TimeFormat {
  const ctx = useContext(PlannerContext);
  if (!ctx) throw new Error("useTimeFormat must be used within a PlannerProvider");
  return ctx.timeFormat;
}
