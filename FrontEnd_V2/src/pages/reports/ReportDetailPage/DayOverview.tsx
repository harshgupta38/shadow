import { useCallback, useEffect } from "react";

import { api } from "@/api";
import { useDashboardPanel } from "@/pages/dashboard/useDashboardPanel";
import { DietSummary } from "@/pages/dashboard/DietSummary/DietSummary";
import { WorkoutSummary } from "@/pages/dashboard/WorkoutSummary/WorkoutSummary";
import { hasTrainingToShow } from "@/pages/dashboard/WorkoutSummary/WorkoutSummary.constants";
// The panels' shared styles are scoped to .dashboard-page, which wraps them below.
import "@/pages/dashboard/DashboardPage.scss";

/**
 * The dashboard's training and nutrition panels for one day, read from that day's own data when the report is opened. Each half is
 * left out when there is nothing to show for the day, and a half that fails to load is left out too, so it never gets in the report's way.
 * Give it a key of the date, so a new date starts from nothing.
 */
export function DayOverview({ date }: { date: string }) {
  const loadWorkout = useCallback(async () => {
    const overview = await api.workout.getOverview(date);
    return hasTrainingToShow(overview) ? overview : null;
  }, [date]);

  const loadDiet = useCallback(async () => {
    const overview = await api.diet.getOverview(date); // fails without a nutrition profile, which leaves the panel out like any failure
    return overview.meals.length > 0 || overview.water.consumed > 0 ? overview : null;
  }, [date]);

  const workout = useDashboardPanel(loadWorkout);
  const diet = useDashboardPanel(loadDiet);
  const { reload: reloadWorkout } = workout;
  const { reload: reloadDiet } = diet;

  useEffect(() => {
    reloadWorkout();
    reloadDiet();
  }, [reloadWorkout, reloadDiet]);

  if (!workout.data && !diet.data) return null;

  return (
    <div className="dashboard-page gap-4 mt-3">
      {workout.data && <WorkoutSummary overview={workout.data} snapshot />}
      {diet.data && <DietSummary overview={diet.data} snapshot />}
    </div>
  );
}
