import { useCallback, useEffect, useRef, useState } from "react";
import { PlusLg, Stars } from "react-bootstrap-icons";

import { api } from "@/api";
import type { DietCoachCurrent, DietCoachMeal, DietOverview } from "@/api";
import { useToast } from "@/context/ToastContext";
import { useWakeRefresh } from "@/hooks/useWakeRefresh";
import { DietSkeleton } from "@/pages/diet/DietSkeleton/DietSkeleton";
import { MEAL_OPTIONS, errorMessage, fmt, mealLabel, quantityLabel } from "@/pages/diet/DietPage.constants";
import "./CoachCard.scss";

interface CoachCardProps {
  overview: DietOverview;
  /** Called after an idea is added to the diary, so the day's totals can refresh. */
  onLogged: () => void;
}

/** Asks the diet coach what to eat at the next meal, from what is left of today's targets. The ideas are kept on the server, so every
 *  device signed in to the account shows the same ones until they expire. */
export function CoachCard({ overview, onLogged }: CoachCardProps) {
  const toast = useToast();
  const [saved, setSaved] = useState<DietCoachCurrent | null>(null); // the ideas the server is keeping, if any
  const [loaded, setLoaded] = useState(false); // whether the saved ideas have been read yet
  const [loadFailed, setLoadFailed] = useState(false);
  const [meal, setMeal] = useState<"auto" | DietCoachMeal>("auto");
  const [note, setNote] = useState("");
  const [asking, setAsking] = useState(false);
  const [adding, setAdding] = useState<string | null>(null); // the title of the idea being added
  // Goes up whenever the ideas change, so a read that started before a change cannot put older ideas back on screen.
  const version = useRef(0);
  // The meal and note are taken from the saved ideas once, so a refresh never overwrites what the person is typing.
  const restored = useRef(false);

  const loadSaved = useCallback(async () => {
    const at = version.current;
    try {
      const current = await api.diet.getCoachCurrent();
      if (at !== version.current) return;
      setSaved(current);
      setLoadFailed(false);
      if (!restored.current) {
        restored.current = true;
        if (current) {
          setMeal(current.meal);
          setNote(current.note);
        }
      }
    } catch {
      if (at === version.current) setLoadFailed(true);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void loadSaved();
  }, [loadSaved]);

  // Coming back to the page or the app shows whatever another device has done since.
  useWakeRefresh(() => void loadSaved());

  // The ideas go away on their own when they expire. The server decides when that is; the page only counts it down.
  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => {
      version.current += 1;
      setSaved(null);
    }, saved.expires_in_seconds * 1000);
    return () => window.clearTimeout(timer);
  }, [saved]);

  const left = {
    calories: Math.max(0, overview.remaining_calories),
    protein: Math.max(0, overview.protein.target - overview.protein.consumed),
    carbs: Math.max(0, overview.carbs.target - overview.carbs.consumed),
    fat: Math.max(0, overview.fat.target - overview.fat.consumed),
  };

  async function ask(more: boolean) {
    if (asking || adding !== null) return;
    setAsking(true);
    try {
      const next = await api.diet.suggestMeals({
        meal_type: meal === "auto" ? undefined : meal,
        note: note.trim() || undefined,
        exclude: more && saved ? saved.shown : [],
      });
      version.current += 1;
      setSaved(next);
      setLoadFailed(false);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't get meal ideas right now. Please try again."));
    } finally {
      setAsking(false);
    }
  }

  async function addIdea(index: number) {
    if (!saved || asking || adding !== null) return;
    const { title } = saved.result.ideas[index];
    setAdding(title);
    try {
      const next = await api.diet.addCoachIdea(index, title);
      version.current += 1;
      setSaved(next);
      toast.success(`Added to ${mealLabel(saved.result.meal_type)}.`);
      onLogged();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't add this meal. Please try again."));
      // The ideas may have expired, or changed on another device, so the card shows what is true now.
      void loadSaved();
    } finally {
      setAdding(null);
    }
  }

  const result = saved?.result ?? null;
  const added = new Set(saved?.added ?? []);
  const allBasic = result !== null && result.ideas.length > 0 && result.ideas.every((idea) => idea.source === "basic");

  return (
    <section className="surface dt-ov-card dt-ov-wide dt-coach" aria-label="Diet coach">
      <div className="dt-ov-title-row">
        <h2 className="dt-ov-title"><Stars size={15} aria-hidden="true" /> Hungry but undecided?</h2>
        <span className="dt-ov-sub">
          {fmt(left.calories)} kcal left · P {fmt(left.protein)} g · C {fmt(left.carbs)} g · F {fmt(left.fat)} g
        </span>
      </div>

      <form
        className="dt-coach-form"
        onSubmit={(event) => {
          event.preventDefault();
          void ask(false);
        }}
      >
        <label className="visually-hidden" htmlFor="dt-coach-meal">Meal</label>
        <select id="dt-coach-meal" className="form-select form-select-sm dt-coach-meal" value={meal} onChange={(e) => setMeal(e.target.value as "auto" | DietCoachMeal)}>
          <option value="auto">Next meal</option>
          {MEAL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <label className="visually-hidden" htmlFor="dt-coach-note">Anything in mind</label>
        <input
          id="dt-coach-note"
          className="form-control form-control-sm dt-coach-note"
          maxLength={200}
          placeholder="Anything in mind? e.g. something light, I have paneer"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button type="submit" className="btn btn-brand btn-sm dt-coach-ask" disabled={asking}>
          <Stars size={13} /> {asking ? "Thinking…" : result ? "Ask again" : "Suggest meals"}
        </button>
      </form>

      {loaded && !result && !asking && !loadFailed && (
        <p className="dt-coach-lead">Not sure what to eat next? Get meal ideas that fit what you have left today, what you like and what you usually eat.</p>
      )}

      {loadFailed && !result && !asking && (
        <p className="dt-coach-notice">
          Couldn't load your last meal ideas.{" "}
          <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={() => void loadSaved()}>Retry</button>
        </p>
      )}

      {asking && (
        <div className="dt-coach-ideas" role="status" aria-live="polite" aria-label="Finding meal ideas">
          <DietSkeleton height={190} />
          <DietSkeleton height={190} className="d-none d-lg-block" />
          <DietSkeleton height={190} className="d-none d-lg-block" />
        </div>
      )}

      {!asking && result && (
        <>
          <p className="dt-coach-meta">
            Ideas for <strong>{mealLabel(result.meal_type)}</strong>, aiming for about <strong>{fmt(result.budget.calories)}</strong> kcal
            {" "}and <strong>{fmt(result.budget.protein_g)}</strong> g protein.
          </p>
          {result.notice && <p className="dt-coach-notice">{result.notice}</p>}

          {result.ideas.length > 0 && (
            <ol className="dt-coach-ideas" aria-label="Meal ideas">
              {result.ideas.map((idea, index) => {
                const isAdded = added.has(idea.title);
                return (
                  <li key={idea.title} className="dt-coach-idea">
                    <div className="dt-coach-idea-head">
                      <h3 className="dt-coach-idea-title">{idea.title}</h3>
                      {idea.source === "basic" && <span className="pill" title="Put together from your food library, without the AI">Quick idea</span>}
                    </div>
                    <p className="dt-coach-why">{idea.why}</p>
                    <ul className="dt-coach-items">
                      {idea.items.map((item) => (
                        <li key={item.food_id}>
                          <span className="dt-coach-item-name">{item.name}</span>
                          <span className="dt-coach-item-qty">{quantityLabel(item.quantity, item.unit)}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="dt-coach-totals">
                      <span><strong>{fmt(idea.totals.calories)}</strong> kcal</span>
                      <span className="dt-coach-macros">P {fmt(idea.totals.protein_g)} · C {fmt(idea.totals.carbs_g)} · F {fmt(idea.totals.fat_g)} · Fibre {fmt(idea.totals.fibre_g)}</span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-soft btn-sm dt-coach-add"
                      disabled={isAdded || adding !== null || asking}
                      onClick={() => void addIdea(index)}
                    >
                      {isAdded ? "Added" : adding === idea.title ? "Adding…" : <><PlusLg size={12} /> Add to {mealLabel(result.meal_type)}</>}
                    </button>
                  </li>
                );
              })}
            </ol>
          )}

          <div className="dt-coach-foot">
            {result.ideas.length > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" disabled={asking} onClick={() => void ask(true)}>
                Show different ideas
              </button>
            )}
            <p className="dt-coach-small">
              {allBasic && !result.ai_limit_reached && "The coach couldn't be reached, so these are quick ideas built from your food library. "}
              {result.disclaimer}
            </p>
          </div>
        </>
      )}
    </section>
  );
}
