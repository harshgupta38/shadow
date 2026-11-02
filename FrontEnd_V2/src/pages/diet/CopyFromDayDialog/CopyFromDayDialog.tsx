import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "react-bootstrap";
import { Calendar3, ExclamationCircleFill } from "react-bootstrap-icons";

import { api } from "@/api";
import type { DiaryDay, DiaryMeal } from "@/api";
import { useToast } from "@/context/ToastContext";
import { useTimeFormat } from "@/context/PlannerContext";
import { DietSkeleton } from "@/pages/diet/DietSkeleton/DietSkeleton";
import { addDaysIso, errorMessage, fmt, mealLabel, quantityLabel, sortMeals, toTimeInput } from "@/pages/diet/DietPage.constants";
import { formatDisplayDate, formatTime, todayIso } from "@/services/date.service";
import "@/styles/date-toolbar.scss";
import "./CopyFromDayDialog.scss";

type Status = "loading" | "ready" | "error";

interface CopyFromDayDialogProps {
  show: boolean;
  /** The day the foods are copied into, "YYYY-MM-DD". */
  targetDate: string;
  onClose: () => void;
  /** Called with the target day as it is after the copy, and how many foods were added. */
  onCopied: (day: DiaryDay, copied: number) => void;
}

/** A checkbox that shows "some" when only part of a meal's foods are ticked. */
function MealCheckbox({ checked, indeterminate, label, onChange }: { checked: boolean; indeterminate: boolean; label: string; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return <input ref={ref} type="checkbox" className="form-check-input dt-copy-check" checked={checked} onChange={onChange} aria-label={label} />;
}

/** Pick a day, then tick the foods to bring over, from any of its meals. Nothing is ticked to start with. */
export function CopyFromDayDialog({ show, targetDate, onClose, onCopied }: CopyFromDayDialogProps) {
  const toast = useToast();
  const timeFormat = useTimeFormat();
  const today = todayIso();
  const [fromDate, setFromDate] = useState(() => addDaysIso(targetDate, -1));
  const [source, setSource] = useState<DiaryDay | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [copying, setCopying] = useState(false);

  const sameDay = fromDate === targetDate;

  // Each time the dialog opens it starts from the day before the one being filled in.
  useEffect(() => {
    if (show) setFromDate(addDaysIso(targetDate, -1));
  }, [show, targetDate]);

  useEffect(() => {
    if (!show || sameDay) return;
    let active = true; // only the newest day may fill the list
    setStatus("loading");
    setSource(null);
    setSelected(new Set());
    void api.diet
      .getDiary(fromDate)
      .then((day) => {
        if (!active) return;
        setSource(day);
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [show, fromDate, sameDay, reloadKey]);

  const meals = useMemo(() => sortMeals(source?.meals ?? []), [source]);
  const chosen = useMemo(() => {
    const items = meals.flatMap((meal) => meal.items).filter((item) => selected.has(item.id));
    return { count: items.length, calories: items.reduce((sum, item) => sum + item.calories, 0) };
  }, [meals, selected]);

  const toggleItem = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  function toggleMeal(meal: DiaryMeal) {
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = meal.items.every((item) => next.has(item.id));
      for (const item of meal.items) {
        if (allOn) next.delete(item.id);
        else next.add(item.id);
      }
      return next;
    });
  }

  async function copy() {
    setCopying(true);
    try {
      const result = await api.diet.copyItems({ from_date: fromDate, to_date: targetDate, item_ids: [...selected] });
      onCopied(result.day, result.copied_items);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't copy these foods."));
    } finally {
      setCopying(false);
    }
  }

  return (
    <Modal show={show} onHide={onClose} centered scrollable>
      <Modal.Header closeButton>
        <Modal.Title as="h5">Copy from another day</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="form-label fw-semibold mb-1">From date</p>
        <div className="date-field">
          <span className="date-display" aria-hidden="true">{formatDisplayDate(fromDate)}</span>
          <Calendar3 className="date-calendar-icon" size={16} aria-hidden="true" />
          <input
            type="date"
            value={fromDate}
            max={today}
            onChange={(e) => e.target.value && setFromDate(e.target.value > today ? today : e.target.value)}
            onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
            aria-label="Copy from date"
          />
        </div>

        <div className="dt-copy-body">
          {sameDay && <p className="dt-copy-note">That is the day you are adding to. Pick another day.</p>}

          {!sameDay && status === "loading" && (
            <div className="dt-copy-loading" aria-hidden="true">
              <DietSkeleton height={44} />
              <DietSkeleton height={44} />
              <DietSkeleton height={44} />
            </div>
          )}

          {!sameDay && status === "error" && (
            <p className="dt-copy-note dt-copy-note--error">
              <ExclamationCircleFill size={12} /> Couldn't load this day{" "}
              <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={() => setReloadKey((k) => k + 1)}>Retry</button>
            </p>
          )}

          {!sameDay && status === "ready" && meals.length === 0 && <p className="dt-copy-note">Nothing was logged on {formatDisplayDate(fromDate)}.</p>}

          {!sameDay && status === "ready" && meals.length > 0 && (
            <>
              <p className="form-label fw-semibold mb-2">Foods to copy</p>
              <ul className="dt-copy-meals">
                {meals.map((meal) => {
                  const ticked = meal.items.filter((item) => selected.has(item.id)).length;
                  return (
                    <li key={meal.id} className="dt-copy-meal">
                      <label className="dt-copy-meal-head">
                        <MealCheckbox
                          checked={ticked === meal.items.length}
                          indeterminate={ticked > 0 && ticked < meal.items.length}
                          label={`Select all of ${mealLabel(meal.meal_type)}`}
                          onChange={() => toggleMeal(meal)}
                        />
                        <span className="dt-copy-meal-name">{mealLabel(meal.meal_type)}</span>
                        {meal.eaten_at && <span className="dt-copy-meal-time">{formatTime(toTimeInput(meal.eaten_at), timeFormat)}</span>}
                        <span className="dt-copy-kcal">{fmt(meal.totals.calories)} kcal</span>
                      </label>
                      <ul className="dt-copy-items">
                        {meal.items.map((item) => (
                          <li key={item.id}>
                            <label className="dt-copy-item">
                              <input type="checkbox" className="form-check-input dt-copy-check" checked={selected.has(item.id)} onChange={() => toggleItem(item.id)} />
                              <span className="dt-copy-item-name">{item.name}</span>
                              <span className="dt-copy-item-qty">{quantityLabel(item.quantity, item.unit)}</span>
                              <span className="dt-copy-kcal">{fmt(item.calories)} kcal</span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <span className="dt-copy-summary">
          {chosen.count > 0 ? `${chosen.count} ${chosen.count === 1 ? "food" : "foods"} · ${fmt(chosen.calories)} kcal` : "Nothing chosen"}
        </span>
        <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-brand" disabled={chosen.count === 0 || sameDay || copying} onClick={() => void copy()}>
          {copying ? "Copying…" : chosen.count > 0 ? `Copy ${chosen.count}` : "Copy"}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
