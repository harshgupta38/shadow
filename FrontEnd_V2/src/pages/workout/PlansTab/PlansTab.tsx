import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardCheck, PlusLg } from "react-bootstrap-icons";
import { useNavigate } from "react-router-dom";

import { api, ApiError } from "@/api";
import type { WorkoutGoal, WorkoutLevel, WorkoutPlanSource, WorkoutPlanSummary } from "@/api";
import { FilterDropdown } from "@/components/ui/FilterDropdown/FilterDropdown";
import { IllustratedErrorState } from "@/components/ui/IllustratedErrorState/IllustratedErrorState";
import { useToast } from "@/context/ToastContext";
import { ROUTES } from "@/routes/RoutePaths";
import { PlanCard } from "@/pages/workout/PlansTab/PlanCard/PlanCard";
import { SearchBox } from "@/pages/workout/SearchBox/SearchBox";
import { Skeleton } from "@/pages/workout/Skeleton/Skeleton";
import { GOAL_OPTIONS, LEVEL_OPTIONS } from "@/pages/workout/WorkoutPage.constants";
import "./PlansTab.scss";

type SourceTab = "all" | WorkoutPlanSource;

const DAYS_OPTIONS = [
  { value: "1-3", label: "1 to 3 days" },
  { value: "4", label: "4 days" },
  { value: "5-7", label: "5 to 7 days" },
];

function matchesDays(daysPerWeek: number, selected: string[]): boolean {
  if (selected.length === 0) return true;
  return selected.some((range) => {
    if (range === "1-3") return daysPerWeek <= 3;
    if (range === "4") return daysPerWeek === 4;
    return daysPerWeek >= 5;
  });
}

function toggle<T extends string>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function PlansTab() {
  const navigate = useNavigate();
  const toast = useToast();

  const [plans, setPlans] = useState<WorkoutPlanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [source, setSource] = useState<SourceTab>("all");
  const [query, setQuery] = useState("");
  const [goals, setGoals] = useState<WorkoutGoal[]>([]);
  const [levels, setLevels] = useState<WorkoutLevel[]>([]);
  const [days, setDays] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPlans(await api.workout.getPlans());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load your plans right now.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(
    () => ({
      all: plans.length,
      predefined: plans.filter((p) => p.source === "predefined").length,
      custom: plans.filter((p) => p.source === "custom").length,
    }),
    [plans],
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return plans.filter((p) => {
      if (source !== "all" && p.source !== source) return false;
      if (goals.length > 0 && !goals.includes(p.goal)) return false;
      if (levels.length > 0 && !levels.includes(p.level)) return false;
      if (!matchesDays(p.days_per_week, days)) return false;
      if (q && !`${p.name} ${p.description}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [plans, source, query, goals, levels, days]);

  const filtersActive = query.trim() !== "" || goals.length > 0 || levels.length > 0 || days.length > 0;

  function resetFilters() {
    setQuery("");
    setGoals([]);
    setLevels([]);
    setDays([]);
  }

  async function activate(plan: WorkoutPlanSummary) {
    setBusyId(plan.id);
    try {
      await api.workout.activatePlan(plan.id);
      setPlans((prev) => prev.map((p) => ({ ...p, is_active: p.id === plan.id })));
      toast.success(`You're now following "${plan.name}".`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't switch plans. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function deactivate(plan: WorkoutPlanSummary) {
    setBusyId(plan.id);
    try {
      await api.workout.deactivatePlan();
      setPlans((prev) => prev.map((p) => ({ ...p, is_active: false })));
      toast.success(`You've stopped following "${plan.name}". Your history is kept.`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't stop following this plan. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  const openPlan = (plan: WorkoutPlanSummary) => navigate(ROUTES.WORKOUT_PLAN_DETAIL.replace(":planId", String(plan.id)));
  const createPlan = () => navigate(ROUTES.WORKOUT_PLAN_CREATE);

  if (error) return <IllustratedErrorState onRetry={() => void load()} />;

  const tabs: { id: SourceTab; label: string }[] = [
    { id: "all", label: `All plans (${counts.all})` },
    { id: "predefined", label: `Ready-made (${counts.predefined})` },
    { id: "custom", label: `My plans (${counts.custom})` },
  ];
  const showCreateCard = (source === "all" || source === "custom") && !filtersActive;

  return (
    <div className="wk-plans">
      <div className="wk-plans-bar">
        <div className="nav-tabs-jv" role="tablist" aria-label="Plan source">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={source === t.id}
              className={`nav-tab-jv${source === t.id ? " active" : ""}`}
              onClick={() => setSource(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="wk-plans-controls">
          <SearchBox value={query} onChange={setQuery} placeholder="Search plans" label="Search plans" />
          <FilterDropdown
            label="Filters"
            width={280}
            onReset={resetFilters}
            sections={[
              {
                key: "goal",
                label: "Goal",
                options: GOAL_OPTIONS,
                selected: goals,
                onToggle: (v) => setGoals((prev) => toggle(prev, v as WorkoutGoal)),
              },
              {
                key: "level",
                label: "Level",
                options: LEVEL_OPTIONS,
                selected: levels,
                onToggle: (v) => setLevels((prev) => toggle(prev, v as WorkoutLevel)),
              },
              {
                key: "days",
                label: "Days per week",
                options: DAYS_OPTIONS,
                selected: days,
                onToggle: (v) => setDays((prev) => toggle(prev, v)),
              },
            ]}
          />
          {filtersActive && (
            <button type="button" className="wk-filter-clear" onClick={resetFilters}>Clear all</button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="wk-plan-grid" aria-hidden="true">
          {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} height={380} />)}
        </div>
      ) : results.length === 0 && !showCreateCard ? (
        <div className="empty-state surface">
          <div className="empty-icon mx-auto mb-3"><ClipboardCheck size={24} /></div>
          <h2 className="h6 fw-bold">No plans match</h2>
          <p className="mb-3">Try different filters, or build your own plan.</p>
          <div className="d-flex gap-2 justify-content-center">
            {filtersActive && <button type="button" className="btn btn-soft" onClick={resetFilters}>Clear filters</button>}
            <button type="button" className="btn btn-brand" onClick={createPlan}>Create a plan</button>
          </div>
        </div>
      ) : (
        <div className="wk-plan-grid">
          {results.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              busy={busyId === plan.id}
              onOpen={openPlan}
              onActivate={(p) => void activate(p)}
              onDeactivate={(p) => void deactivate(p)}
            />
          ))}
          {showCreateCard && (
            <button type="button" className="wk-plan-new" onClick={createPlan}>
              <span className="wk-plan-new-icon"><PlusLg size={20} /></span>
              <strong>Build your own plan</strong>
              <span>Pick the exercises, choose your training days, set sets and reps your way.</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
