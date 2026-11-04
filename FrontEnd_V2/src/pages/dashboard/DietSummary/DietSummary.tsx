import { Link } from "react-router-dom";

import type { DietOverview } from "@/api";
import { useDateFormat } from "@/context/PlannerContext";
import { DashboardRing } from "@/pages/dashboard/DashboardRing/DashboardRing";
import { dayHeading } from "@/pages/dashboard/DashboardPage.constants";
import { WaterBottle } from "@/pages/dashboard/DietSummary/WaterBottle/WaterBottle";
import { MacroBar } from "@/pages/diet/MacroBar/MacroBar";
import { fmt, mealLabel, sortMeals } from "@/pages/diet/DietPage.constants";
import { ROUTES } from "@/routes/RoutePaths";
import { todayIso } from "@/services/date.service";
// The report card and its ring are the ones the Reports Overview panel uses.
import "@/pages/dashboard/ReportsOverview/ReportsOverview.scss";
import "./DietSummary.scss";

interface DietSummaryProps {
  overview: DietOverview;
  /** The panel as a record of a past day, as in a daily report: no calls to act on today. */
  snapshot?: boolean;
}

/** Today's nutrition at a glance: the score and what is left, the meals so far, and the macros against their targets. */
export function DietSummary({ overview, snapshot = false }: DietSummaryProps) {
  const dateFormat = useDateFormat();
  const isToday = overview.date === todayIso();
  const meals = sortMeals(overview.meals);
  const mostCalories = Math.max(1, ...meals.map((meal) => meal.totals.calories));
  const score = overview.score.score;
  const over = overview.remaining_calories < 0;

  return (
    <div className="dp-section">
      <div className="dp-section-head">
        <h2 className="dp-section-title">Nutrition</h2>
        <span className="dp-section-chip">{fmt(overview.calories.target)} kcal a day</span>
        <Link to={ROUTES.DIET} className="dp-section-link">Open diet →</Link>
      </div>

      <div className="dp-report-hero dp-report-hero--aside dp-dt-card">
        <div className="dp-dt-gauges">
          <WaterBottle consumed={overview.water.consumed} target={overview.water.target} />
          <DashboardRing
            percent={score ?? 0}
            value={score === null ? "–" : String(score)}
            caption="Score"
            ariaLabel={score === null ? "No score yet today" : `Nutrition score ${score} out of 100`}
          />
        </div>
        <div className="dp-report-body">
          <span className="dp-report-date">{dayHeading(overview.date, dateFormat)}</span>
          {meals.length === 0 ? (
            <>
              <h3 className="dp-report-headline">Nothing logged yet</h3>
              <p className="dp-report-summary">Log a meal to see how the day adds up against your targets.</p>
            </>
          ) : (
            <>
              <h3 className="dp-report-headline">{fmt(Math.abs(overview.remaining_calories))} kcal {over ? "over" : "left"}</h3>
              <p className="dp-report-summary">
                {fmt(overview.calories.consumed)} of {fmt(overview.calories.target)} kcal · {meals.length} {meals.length === 1 ? "meal" : "meals"}{isToday ? " so far" : ""}
              </p>
            </>
          )}
          {!snapshot && <Link to={`${ROUTES.DIET}?tab=diary`} className="dp-report-cta">Log food →</Link>}
        </div>

        {meals.length > 0 && (
          <div className="dp-hero-aside">
            <span className="dp-hero-aside-title">{isToday ? "Meals today" : "Meals"}</span>
            <ul className="dp-rank">
              {meals.map((meal) => (
                <li key={meal.meal_type}>
                  <span className="dp-rank-name">{mealLabel(meal.meal_type)}</span>
                  <span className="dp-rank-track" aria-hidden="true"><span style={{ width: `${(meal.totals.calories / mostCalories) * 100}%` }} /></span>
                  <span className="dp-rank-value">{fmt(meal.totals.calories)} kcal</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="dp-dt-macros">
          <MacroBar label="Water" tone="water" unit="ml" consumed={overview.water.consumed} target={overview.water.target} />
          <MacroBar label="Protein" tone="protein" consumed={overview.protein.consumed} target={overview.protein.target} />
          <MacroBar label="Carbs" tone="carbs" consumed={overview.carbs.consumed} target={overview.carbs.target} />
          <MacroBar label="Fat" tone="fat" consumed={overview.fat.consumed} target={overview.fat.target} />
          <MacroBar label="Fibre" tone="fibre" consumed={overview.fibre.consumed} target={overview.fibre.target} />
        </div>
      </div>
    </div>
  );
}
