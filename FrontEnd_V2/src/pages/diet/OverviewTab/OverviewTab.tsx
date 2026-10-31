import { useCallback, useEffect, useState } from "react";
import { Droplet, Floppy, PlusLg } from "react-bootstrap-icons";

import { api } from "@/api";
import type { DietOverview, WaterDay, WaterHistoryPoint } from "@/api";
import { IllustratedErrorState } from "@/components/ui/IllustratedErrorState/IllustratedErrorState";
import { useToast } from "@/context/ToastContext";
import { useWakeRefresh } from "@/hooks/useWakeRefresh";
import { CalorieRing } from "@/pages/diet/CalorieRing/CalorieRing";
import { DietSkeleton } from "@/pages/diet/DietSkeleton/DietSkeleton";
import { MacroBar } from "@/pages/diet/MacroBar/MacroBar";
import { WATER_QUICK_ML, barPercent, errorMessage, fmt, mealLabel, sortMeals } from "@/pages/diet/dietMath";
import { formatTime } from "@/services/date.service";
import "./OverviewTab.scss";

interface OverviewTabProps {
  onLogFood: () => void;
}

export function OverviewTab({ onLogFood }: OverviewTabProps) {
  const toast = useToast();
  const [overview, setOverview] = useState<DietOverview | null>(null);
  const [water, setWater] = useState<WaterDay | null>(null);
  const [history, setHistory] = useState<WaterHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [waterBusy, setWaterBusy] = useState(false);
  const [customMl, setCustomMl] = useState("");

  const load = useCallback(async () => {
    setError(false);
    try {
      const [o, w, h] = await Promise.all([api.diet.getOverview(), api.diet.getWater(), api.diet.getWaterHistory(7)]);
      setOverview(o);
      setWater(w);
      setHistory(h);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useWakeRefresh(() => void load());

  /** Returns whether the change itself went through. A failed refresh afterwards is reported separately, because the water is saved. */
  async function changeWater(action: () => Promise<WaterDay>, failure: string): Promise<boolean> {
    if (waterBusy) return false;
    setWaterBusy(true);
    try {
      setWater(await action());
    } catch (err) {
      toast.error(errorMessage(err, failure));
      setWaterBusy(false);
      return false;
    }
    try {
      const [o, h] = await Promise.all([api.diet.getOverview(), api.diet.getWaterHistory(7)]);
      setOverview(o);
      setHistory(h);
    } catch {
      toast.info("Saved, but the day's totals couldn't refresh. Reload to update them.");
    } finally {
      setWaterBusy(false);
    }
    return true;
  }

  if (loading) {
    return (
      <div className="dt-ov-grid" aria-hidden="true">
        <DietSkeleton height={260} />
        <DietSkeleton height={260} />
        <DietSkeleton height={200} />
        <DietSkeleton height={200} />
      </div>
    );
  }
  if (error || !overview || !water) return <IllustratedErrorState onRetry={() => { setLoading(true); void load(); }} />;

  const { calories, score } = overview;
  const customAmount = Math.round(Number(customMl));
  const customValid = customAmount !== 0 && Math.abs(customAmount) <= 10000;
  const waterTarget = overview.water.target;
  const hasMeals = overview.meals.length > 0;

  return (
    <div className="dt-ov">
      {overview.has_estimated_items && (
        <p className="dt-ov-note">
          Some of today's nutrition comes from estimates: library values are approximate, and household measures like a bowl are rough. Treat the totals as a guide.
        </p>
      )}

      <div className="dt-ov-grid">
        <section className="surface dt-ov-card dt-ov-calories" aria-label="Calories">
          <CalorieRing consumed={calories.consumed} target={calories.target} />
          <dl className="dt-ov-stats">
            <div><dt>Eaten</dt><dd>{fmt(calories.consumed)}</dd></div>
            <div><dt>Target</dt><dd>{fmt(calories.target)}</dd></div>
            <div><dt>{overview.remaining_calories < 0 ? "Over" : "Remaining"}</dt><dd>{fmt(Math.abs(overview.remaining_calories))}</dd></div>
            <div><dt>Of target</dt><dd>{fmt(calories.percent)}%</dd></div>
          </dl>
          <button type="button" className="btn btn-brand btn-sm dt-ov-log" onClick={onLogFood}>
            <PlusLg size={13} /> Log food
          </button>
        </section>

        <section className="surface dt-ov-card" aria-label="Macronutrients">
          <h2 className="dt-ov-title">Macros</h2>
          <div className="dt-ov-macros">
            <MacroBar label="Protein" tone="protein" consumed={overview.protein.consumed} target={overview.protein.target} />
            <MacroBar label="Carbohydrates" tone="carbs" consumed={overview.carbs.consumed} target={overview.carbs.target} />
            <MacroBar label="Fat" tone="fat" consumed={overview.fat.consumed} target={overview.fat.target} />
            <MacroBar label="Fibre" tone="fibre" consumed={overview.fibre.consumed} target={overview.fibre.target} />
          </div>
        </section>

        <section className="surface dt-ov-card" aria-label="Water">
          <div className="dt-ov-title-row">
            <h2 className="dt-ov-title"><Droplet size={15} aria-hidden="true" /> Water</h2>
            <span className="dt-ov-sub">{fmt(water.total_ml)} / {fmt(waterTarget)} ml</span>
          </div>
          <MacroBar label="Today" tone="water" unit="ml" consumed={water.total_ml} target={waterTarget} />
          <div className="dt-ov-water-actions" role="group" aria-label="Add water">
            {WATER_QUICK_ML.map((ml) => (
              <button key={ml} type="button" className="btn btn-soft btn-sm" disabled={waterBusy} onClick={() => void changeWater(() => api.diet.addWater(ml), "Couldn't add water.")}>
                +{ml} ml
              </button>
            ))}
            <div className="dt-ov-water-custom">
              <label className="visually-hidden" htmlFor="dt-water-custom">Amount in ml (negative to remove)</label>
              {customMl && customValid && (
                <button
                  type="button"
                  className="btn btn-ghost btn-icon border-0 dt-ov-water-save"
                  aria-label="Add water"
                  disabled={waterBusy}
                  onClick={() => void changeWater(() => api.diet.addWater(customAmount), "Couldn't update water.").then((ok) => ok && setCustomMl(""))}
                >
                  <Floppy size={13} />
                </button>
              )}
              <input
                id="dt-water-custom"
                type="number"
                inputMode="numeric"
                className="dt-ov-water-input"
                placeholder="Add..."
                value={customMl}
                disabled={waterBusy}
                onChange={(e) => setCustomMl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && customValid) {
                    void changeWater(() => api.diet.addWater(customAmount), "Couldn't update water.").then((ok) => ok && setCustomMl(""));
                  }
                }}
              />
            </div>
          </div>
          <div className="dt-ov-history" role="img" aria-label={`Water over the last ${history.length} days: ${history.map((p) => `${fmt(p.total_ml)} ml`).join(", ")}`}>
            {history.map((point) => (
              <div key={point.date} className="dt-ov-history-bar" title={`${point.date}: ${fmt(point.total_ml)} ml`}>
                <div className="dt-ov-history-fill" style={{ height: `${barPercent(waterTarget > 0 ? (point.total_ml / waterTarget) * 100 : 0)}%` }} />
              </div>
            ))}
          </div>
          <p className="dt-ov-caption">Last {history.length} days. An empty bar means nothing was logged.</p>
        </section>

        <section className="surface dt-ov-card" aria-label="Nutrition score">
          <h2 className="dt-ov-title">Nutrition score</h2>
          {score.score === null ? (
            <p className="dt-ov-empty">Log something today to see your score. A day with no entries isn't scored.</p>
          ) : (
            <>
              <div className="dt-ov-score">
                <span className="dt-ov-score-value">{score.score}</span>
                <span className="dt-ov-score-max">/ 100</span>
              </div>
              <ul className="dt-ov-components">
                {score.components.map((c) => (
                  <li key={c.key} title={c.explanation}>
                    <span className="dt-ov-comp-name">{c.key[0].toUpperCase() + c.key.slice(1)}</span>
                    <span className="dt-ov-comp-bar" aria-hidden="true"><span style={{ width: `${(c.points / c.max_points) * 100}%` }} /></span>
                    <span className="dt-ov-comp-pts">{fmt(c.points, 1)}/{c.max_points}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <details className="dt-ov-how">
            <summary>How is this calculated?</summary>
            <p>{score.explanation}</p>
            {score.components.length > 0 && <ul>{score.components.map((c) => <li key={c.key}>{c.explanation}</li>)}</ul>}
          </details>
        </section>

        <section className="surface dt-ov-card dt-ov-wide" aria-label="Meals today">
          <h2 className="dt-ov-title">Meals today</h2>
          {hasMeals ? (
            <ul className="dt-ov-meals">
              {sortMeals(overview.meals).map((meal) => (
                <li key={meal.meal_type}>
                  <span className="dt-ov-meal-name">{mealLabel(meal.meal_type)}</span>
                  <span className="dt-ov-meal-meta">
                    {meal.item_count} {meal.item_count === 1 ? "food" : "foods"}
                    {meal.eaten_at ? ` · ${formatTime(meal.eaten_at.slice(0, 5))}` : ""}
                  </span>
                  <span className="dt-ov-meal-kcal"><strong>{fmt(meal.totals.calories)}</strong> kcal</span>
                  <span className="dt-ov-meal-macros">P {fmt(meal.totals.protein_g)} · C {fmt(meal.totals.carbs_g)} · F {fmt(meal.totals.fat_g)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dt-ov-empty">No meals logged yet today. Anything you eat that isn't logged is simply not counted.</p>
          )}
        </section>
      </div>

      <p className="dt-ov-disclaimer">{overview.disclaimer}</p>
    </div>
  );
}
