import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, Stars } from "react-bootstrap-icons";

import { api } from "@/api";
import type { DiaryDay, DiaryItem, DiaryMeal, DietProfile, FoodLogProposal } from "@/api";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { IllustratedErrorState } from "@/components/ui/IllustratedErrorState/IllustratedErrorState";
import { TextFieldPromptDialog } from "@/components/ui/TextFieldPromptDialog/TextFieldPromptDialog";
import { useToast } from "@/context/ToastContext";
import { DietSkeleton } from "@/pages/diet/DietSkeleton/DietSkeleton";
import { EditItemDialog } from "@/pages/diet/EditItemDialog/EditItemDialog";
import { FoodSearchModal } from "@/pages/diet/FoodSearchModal/FoodSearchModal";
import { MealCard } from "@/pages/diet/MealCard/MealCard";
import { ProposalReview } from "@/pages/diet/ProposalReview/ProposalReview";
import { MEAL_OPTIONS, MEAL_ORDER, addDaysIso, errorMessage, fmt, mealLabel, sortMeals, suggestMealType } from "@/pages/diet/dietMath";
import { currentIstHour, formatDisplayDate, todayIso } from "@/services/date.service";
import "./DiaryTab.scss";

interface DiaryTabProps {
  profile: DietProfile;
}

export function DiaryTab({ profile }: DiaryTabProps) {
  const toast = useToast();
  const today = todayIso();
  const [date, setDate] = useState(today);
  const [day, setDay] = useState<DiaryDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [addFor, setAddFor] = useState<string | null>(null);
  const [proposal, setProposal] = useState<FoodLogProposal | null>(null);
  const [text, setText] = useState("");
  const [textMeal, setTextMeal] = useState("auto");
  const [parsing, setParsing] = useState(false);

  const [editing, setEditing] = useState<DiaryItem | null>(null);
  const [removing, setRemoving] = useState<DiaryItem | null>(null);
  const [clearing, setClearing] = useState<DiaryMeal | null>(null);
  const [savingMeal, setSavingMeal] = useState<DiaryMeal | null>(null);
  const [busy, setBusy] = useState(false);

  // Only the newest request may update the screen, so quickly changing day can't leave one day's meals under another's header.
  const loadSeq = useRef(0);
  const dateRef = useRef(date);
  dateRef.current = date;

  const load = useCallback(async () => {
    const id = ++loadSeq.current;
    setError(false);
    try {
      const result = await api.diet.getDiary(date);
      if (id === loadSeq.current) setDay(result);
    } catch {
      if (id === loadSeq.current) setError(true);
    } finally {
      if (id === loadSeq.current) setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    setLoading(true);
    setProposal(null);
    void load();
  }, [load]);

  /** Runs a change, then reloads the day so every total on screen comes from the server. */
  const mutate = useCallback(
    async (action: () => Promise<unknown>, failure: string, success?: string): Promise<boolean> => {
      setBusy(true);
      try {
        await action();
        if (success) toast.success(success);
        await load();
        return true;
      } catch (err) {
        toast.error(errorMessage(err, failure));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [load, toast],
  );

  async function describeMeal(event: React.FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value || parsing) return;
    setParsing(true);
    try {
      const result = await api.diet.parseMeal({
        text: value,
        log_date: date,
        meal_type: textMeal === "auto" ? undefined : textMeal,
      });
      if (result.log_date === dateRef.current) setProposal(result); // the day may have changed while the AI was reading
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't read that. Try the food search instead."));
    } finally {
      setParsing(false);
    }
  }

  const slots = useMemo(() => {
    const logged = day ? sortMeals(day.meals) : [];
    const custom = logged.filter((m) => !(MEAL_ORDER as readonly string[]).includes(m.meal_type));
    return [
      ...MEAL_ORDER.map((type) => ({ type: type as string, meal: logged.find((m) => m.meal_type === type) ?? null })),
      ...custom.map((m) => ({ type: m.meal_type, meal: m })),
    ];
  }, [day]);

  const isToday = date === today;
  const hasFood = (day?.meals.length ?? 0) > 0;

  return (
    <div className="dt-diary">
      <div className="dt-diary-nav" role="group" aria-label="Choose a day">
        <button type="button" className="btn btn-soft btn-sm" aria-label="Previous day" onClick={() => setDate(addDaysIso(date, -1))}>
          <ChevronLeft size={14} />
        </button>
        <div className="dt-diary-date">
          <strong>{isToday ? "Today" : formatDisplayDate(date)}</strong>
          {isToday && <span>{formatDisplayDate(date)}</span>}
        </div>
        <button type="button" className="btn btn-soft btn-sm" aria-label="Next day" disabled={isToday} onClick={() => setDate(addDaysIso(date, 1))}>
          <ChevronRight size={14} />
        </button>
        <label className="visually-hidden" htmlFor="dt-diary-picker">Jump to a date</label>
        <input id="dt-diary-picker" type="date" className="form-control form-control-sm dt-diary-picker" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value > today ? today : e.target.value)} />
        {!isToday && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDate(today)}>Back to today</button>}
      </div>

      <form className="surface dt-nl" onSubmit={describeMeal}>
        <label htmlFor="dt-nl-text" className="dt-nl-label"><Stars size={14} aria-hidden="true" /> Tell Shadow what you ate</label>
        <textarea
          id="dt-nl-text"
          className="form-control dt-nl-input"
          rows={2}
          maxLength={1000}
          placeholder="e.g. two chapatis, 150 grams of chicken curry and a bowl of rice for lunch"
          value={text}
          disabled={parsing}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void describeMeal(e);
          }}
        />
        <div className="dt-nl-row">
          <select className="form-select form-select-sm dt-nl-meal" aria-label="Meal" value={textMeal} onChange={(e) => setTextMeal(e.target.value)}>
            <option value="auto">Meal: work it out</option>
            {MEAL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button type="submit" className="btn btn-brand btn-sm" disabled={!text.trim() || parsing}>
            {parsing ? "Reading…" : "Review"}
          </button>
        </div>
        <p className="dt-nl-hint">You'll see every food and amount first. Nothing is saved until you confirm.</p>
      </form>

      {proposal && (
        <ProposalReview
          proposal={proposal}
          onChange={(next) => next.log_date === dateRef.current && setProposal(next)}
          onDiscarded={() => setProposal(null)}
          onConfirmed={() => {
            setProposal(null);
            setText("");
            void load();
          }}
        />
      )}

      {loading ? (
        <div className="dt-diary-skeleton" aria-hidden="true">
          {Array.from({ length: 3 }, (_, i) => <DietSkeleton key={i} height={96} />)}
        </div>
      ) : error ? (
        <IllustratedErrorState onRetry={() => { setLoading(true); void load(); }} />
      ) : day ? (
        <>
          <div className="surface dt-diary-summary" aria-label="Day totals">
            <div>
              <strong>{fmt(day.totals.calories)}</strong>
              <span> of {fmt(profile.calorie_target)} kcal</span>
            </div>
            <div className="dt-diary-macros">
              <span>Protein <strong>{fmt(day.totals.protein_g)}</strong>/{profile.protein_target_g} g</span>
              <span>Carbs <strong>{fmt(day.totals.carbs_g)}</strong>/{profile.carbs_target_g} g</span>
              <span>Fat <strong>{fmt(day.totals.fat_g)}</strong>/{profile.fat_target_g} g</span>
              <span>Fibre <strong>{fmt(day.totals.fibre_g)}</strong>/{profile.fibre_target_g} g</span>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={() =>
                void (async () => {
                  setBusy(true);
                  const id = ++loadSeq.current;
                  try {
                    const result = await api.diet.copyMeals({ from_date: addDaysIso(date, -1), to_date: date });
                    if (id === loadSeq.current) setDay(result.day);
                    const copied = result.copied_meals.map(mealLabel).join(", ");
                    const skipped = result.skipped_meals.map(mealLabel).join(", ");
                    toast.success(copied ? `Copied ${copied}.${skipped ? ` Skipped ${skipped}: already logged.` : ""}` : `Nothing copied: ${skipped} already logged.`);
                  } catch (err) {
                    toast.error(errorMessage(err, "Couldn't copy the previous day."));
                  } finally {
                    setBusy(false);
                  }
                })()
              }
            >
              <Copy size={13} /> Copy previous day
            </button>
          </div>

          {!hasFood && (
            <p className="dt-diary-empty">
              Nothing logged {isToday ? "yet today" : "on this day"}. Describe a meal above, or add food to a meal below. Days without entries are simply unlogged, not counted as skipped.
            </p>
          )}

          <div className="dt-diary-meals">
            {slots.map(({ type, meal }) => (
              <MealCard
                key={type}
                mealType={type}
                meal={meal}
                onAdd={setAddFor}
                onEditItem={setEditing}
                onMoveItem={(item, mealType) => void mutate(() => api.diet.moveItem(item.id, mealType), "Couldn't move this food.", `Moved to ${mealLabel(mealType).toLowerCase()}.`)}
                onDuplicateItem={(item) => void mutate(() => api.diet.duplicateItem(item.id), "Couldn't duplicate this food.")}
                onDeleteItem={setRemoving}
                onSaveMeal={setSavingMeal}
                onDeleteMeal={setClearing}
                onChangeTime={(m, time) => void mutate(() => api.diet.updateMeal(m.id, { eaten_at: time || null }), "Couldn't change the time.")}
              />
            ))}
          </div>
        </>
      ) : null}

      <FoodSearchModal
        show={addFor !== null}
        mealType={addFor ?? suggestMealType(currentIstHour())}
        date={date}
        onClose={() => setAddFor(null)}
        onLogged={() => {
          setAddFor(null);
          void load();
        }}
      />

      <EditItemDialog
        item={editing}
        busy={busy}
        onClose={() => setEditing(null)}
        onSave={(item, quantity, unit) =>
          void mutate(() => api.diet.updateItem(item.id, { quantity, unit }), "Couldn't change this amount.", "Amount updated.").then((ok) => ok && setEditing(null))
        }
      />

      <ConfirmDialog
        show={removing !== null}
        title="Remove this food?"
        message={removing ? `${removing.name} will be removed and your totals for the day will update.` : undefined}
        confirmLabel="Remove"
        destructive
        busy={busy}
        onConfirm={() => removing && void mutate(() => api.diet.deleteItem(removing.id), "Couldn't remove this food.").then((ok) => ok && setRemoving(null))}
        onCancel={() => setRemoving(null)}
      />

      <ConfirmDialog
        show={clearing !== null}
        title={clearing ? `Clear ${mealLabel(clearing.meal_type).toLowerCase()}?` : "Clear meal?"}
        message="Every food in this meal will be removed from your diary."
        confirmLabel="Clear meal"
        destructive
        busy={busy}
        onConfirm={() => clearing && void mutate(() => api.diet.deleteMeal(clearing.id), "Couldn't clear this meal.").then((ok) => ok && setClearing(null))}
        onCancel={() => setClearing(null)}
      />

      <TextFieldPromptDialog
        show={savingMeal !== null}
        title="Save as a meal"
        message="Give it a name, like “My usual lunch”, to log the same foods again in one tap."
        label="Meal name"
        maxLength={80}
        confirmLabel="Save meal"
        busy={busy}
        onConfirm={(name) =>
          savingMeal &&
          void mutate(() => api.diet.saveMeal({ name, log_date: date, meal_type: savingMeal.meal_type }), "Couldn't save this meal.", "Meal saved.").then((ok) => ok && setSavingMeal(null))
        }
        onCancel={() => setSavingMeal(null)}
      />
    </div>
  );
}
