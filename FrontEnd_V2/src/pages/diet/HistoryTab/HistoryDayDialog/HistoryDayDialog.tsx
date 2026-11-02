import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "react-bootstrap";
import { ExclamationCircleFill } from "react-bootstrap-icons";

import { api } from "@/api";
import type { DiaryDay, DietProfile } from "@/api";
import { useTimeFormat } from "@/context/PlannerContext";
import { CalorieRing } from "@/pages/diet/CalorieRing/CalorieRing";
import { DietSkeleton } from "@/pages/diet/DietSkeleton/DietSkeleton";
import { MacroBar } from "@/pages/diet/MacroBar/MacroBar";
import { fmt, mealLabel, quantityLabel, sortMeals, toTimeInput } from "@/pages/diet/DietPage.constants";
import { formatDisplayDate, formatTime } from "@/services/date.service";
import "./HistoryDayDialog.scss";

type Status = "loading" | "ready" | "error";

interface HistoryDayDialogProps {
  /** The day to show, "YYYY-MM-DD". Null keeps the dialog closed. */
  date: string | null;
  profile: DietProfile;
  onClose: () => void;
}

/** The nutrition of one past day against the targets, then every meal of it. */
export function HistoryDayDialog({ date, profile, onClose }: HistoryDayDialogProps) {
  const timeFormat = useTimeFormat();
  const [day, setDay] = useState<DiaryDay | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [reloadKey, setReloadKey] = useState(0);
  // The last opened day stays on screen while the dialog fades out.
  const shownDate = useRef(date);
  if (date) shownDate.current = date;

  useEffect(() => {
    if (!date) return;
    let active = true;
    setStatus("loading");
    setDay(null);
    void api.diet
      .getDiary(date)
      .then((result) => {
        if (!active) return;
        setDay(result);
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [date, reloadKey]);

  const meals = useMemo(() => (day ? sortMeals(day.meals) : []), [day]);

  return (
    <Modal show={date !== null} onHide={onClose} centered dialogClassName="dt-hd-dialog" aria-labelledby="dt-hd-title">
      <Modal.Header closeButton>
        <Modal.Title id="dt-hd-title" className="dt-hd-title">
          {shownDate.current ? formatDisplayDate(shownDate.current) : ""}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {status === "loading" && (
          <div className="dt-hd-loading" aria-hidden="true">
            <DietSkeleton height={130} />
            <DietSkeleton height={90} />
          </div>
        )}

        {status === "error" && (
          <p className="dt-hd-error">
            <ExclamationCircleFill size={12} /> Couldn't load this day{" "}
            <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={() => setReloadKey((k) => k + 1)}>
              Retry
            </button>
          </p>
        )}

        {status === "ready" && day && (
          <>
            <div className="dt-hd-top">
              <div className="dt-hd-ring">
                <CalorieRing consumed={day.totals.calories} target={profile.calorie_target} size={120} />
                <span className="dt-hd-eaten">
                  <strong>{fmt(day.totals.calories)}</strong> of {fmt(profile.calorie_target)} kcal
                </span>
              </div>
              <div className="dt-hd-macros">
                <MacroBar label="Protein" tone="protein" consumed={day.totals.protein_g} target={profile.protein_target_g} />
                <MacroBar label="Carbohydrates" tone="carbs" consumed={day.totals.carbs_g} target={profile.carbs_target_g} />
                <MacroBar label="Fat" tone="fat" consumed={day.totals.fat_g} target={profile.fat_target_g} />
                <MacroBar label="Fibre" tone="fibre" consumed={day.totals.fibre_g} target={profile.fibre_target_g} />
                <MacroBar label="Water" tone="water" unit="ml" consumed={day.water_ml} target={profile.water_target_ml} />
              </div>
            </div>

            {day.has_estimated_items && (
              <p className="dt-hd-estimate">Some of this day's nutrition is estimated: library values are approximate, and household measures like a bowl are rough.</p>
            )}

            <ul className="dt-hd-meals">
              {meals.map((meal) => (
                <li key={meal.id} className="dt-hd-meal">
                  <div className="dt-hd-meal-head">
                    <strong>{mealLabel(meal.meal_type)}</strong>
                    {meal.eaten_at && <span className="dt-hd-meal-time">{formatTime(toTimeInput(meal.eaten_at), timeFormat)}</span>}
                    <span className="dt-hd-meal-kcal">{fmt(meal.totals.calories)} kcal</span>
                  </div>
                  <ul className="dt-hd-items">
                    {meal.items.map((item) => (
                      <li key={item.id}>
                        <span className="dt-hd-item-name">{item.name}</span>
                        <span className="dt-hd-item-qty">{quantityLabel(item.quantity, item.unit)}</span>
                        <span className="dt-hd-item-kcal">{fmt(item.calories)} kcal</span>
                      </li>
                    ))}
                  </ul>
                  <div className="dt-hd-meal-macros">
                    Protein {fmt(meal.totals.protein_g)} g · Carbs {fmt(meal.totals.carbs_g)} g · Fat {fmt(meal.totals.fat_g)} g · Fibre {fmt(meal.totals.fibre_g)} g
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Modal.Body>
    </Modal>
  );
}
