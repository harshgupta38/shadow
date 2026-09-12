import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { type ChildProps, type WeekStartsOn } from "@/api";

const CACHE_KEY = "shadow_week_start";

function readCache(): WeekStartsOn {
  try {
    const v = localStorage.getItem(CACHE_KEY);
    if (v === "monday" || v === "sunday") return v;
  } catch {}
  return "sunday";
}

function writeCache(v: WeekStartsOn): void {
  try { localStorage.setItem(CACHE_KEY, v); } catch {}
}

interface PlannerContextValue {
  weekStartsOn: WeekStartsOn;
}

const PlannerContext = createContext<PlannerContextValue | undefined>(undefined);

export function PlannerProvider({ children }: ChildProps) {
  const [weekStartsOn, setWeekStartsOn] = useState<WeekStartsOn>(readCache);

  // AuthContext fires planner:sync on session restore, login, register, and refreshUser.
  // SettingsPage fires it after a successful save.
  useEffect(() => {
    function handler(e: Event) {
      const v = (e as CustomEvent<{ week_starts_on: WeekStartsOn }>).detail.week_starts_on;
      setWeekStartsOn(v);
      writeCache(v);
    }
    window.addEventListener("planner:sync", handler);
    return () => window.removeEventListener("planner:sync", handler);
  }, []);

  const value = useMemo(() => ({ weekStartsOn }), [weekStartsOn]);

  return <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>;
}

export function useWeekStart(): WeekStartsOn {
  const ctx = useContext(PlannerContext);
  if (!ctx) throw new Error("useWeekStart must be used within a PlannerProvider");
  return ctx.weekStartsOn;
}
