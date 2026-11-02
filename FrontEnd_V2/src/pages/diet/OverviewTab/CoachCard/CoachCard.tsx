import { useEffect, useRef, useState } from "react";
import { PlusLg, Stars } from "react-bootstrap-icons";

import { api } from "@/api";
import type { DietCoachIdea, DietCoachMeal, DietCoachResult, DietOverview } from "@/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { DietSkeleton } from "@/pages/diet/DietSkeleton/DietSkeleton";
import { MEAL_OPTIONS, errorMessage, fmt, mealLabel, newToken, quantityLabel } from "@/pages/diet/DietPage.constants";
import { clearSavedCoach, coachExpiresIn, readSavedCoach, writeSavedCoach } from "@/pages/diet/OverviewTab/CoachCard/CoachCard.constants";
import { todayIso } from "@/services/date.service";
import "./CoachCard.scss";

interface CoachCardProps {
  overview: DietOverview;
  /** Called after an idea is added to the diary, so the day's totals can refresh. */
  onLogged: () => void;
}

type Phase = "idle" | "loading" | "ready";

/** Asks the diet coach what to eat at the next meal, from what is left of today's targets. */
export function CoachCard({ overview, onLogged }: CoachCardProps) {
  const toast = useToast();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  // The last ideas are kept for a few hours, so leaving the page and coming back shows them again.
  const [restored] = useState(() => (userId === null ? null : readSavedCoach(userId)));
  const [meal, setMeal] = useState<"auto" | DietCoachMeal>(restored?.meal ?? "auto");
  const [note, setNote] = useState(restored?.note ?? "");
  const [phase, setPhase] = useState<Phase>(restored ? "ready" : "idle");
  const [result, setResult] = useState<DietCoachResult | null>(restored?.result ?? null);
  const [shown, setShown] = useState<string[]>(restored?.shown ?? []); // every title offered so far, so "different ideas" are different
  const [added, setAdded] = useState<Set<string>>(new Set(restored?.added ?? []));
  const [adding, setAdding] = useState<string | null>(null);
  const requestId = useRef(0);
  const savedAt = useRef(restored?.savedAt ?? 0);
  const savedDay = useRef(restored?.day ?? todayIso());

  // Keep what is on screen saved, with the time the ideas arrived (not the time of the last tap).
  useEffect(() => {
    if (userId === null || !result) return;
    writeSavedCoach(userId, { savedAt: savedAt.current, day: savedDay.current, meal, note, result, shown, added: [...added] });
  }, [userId, result, meal, note, shown, added]);

  // If the page stays open past the keep time, the ideas go away on their own.
  useEffect(() => {
    if (userId === null || !result) return;
    const timer = window.setTimeout(() => {
      clearSavedCoach(userId);
      setResult(null);
      setShown([]);
      setAdded(new Set());
      setPhase("idle");
    }, Math.max(0, coachExpiresIn(savedAt.current)));
    return () => window.clearTimeout(timer);
  }, [userId, result]);

  const left = {
    calories: Math.max(0, overview.remaining_calories),
    protein: Math.max(0, overview.protein.target - overview.protein.consumed),
    carbs: Math.max(0, overview.carbs.target - overview.carbs.consumed),
    fat: Math.max(0, overview.fat.target - overview.fat.consumed),
  };

  async function ask(more: boolean) {
    if (phase === "loading") return;
    const id = ++requestId.current;
    setPhase("loading");
    try {
      const next = await api.diet.suggestMeals({
        meal_type: meal === "auto" ? undefined : meal,
        note: note.trim() || undefined,
        exclude: more ? shown : [],
      });
      if (id !== requestId.current) return;
      const titles = next.ideas.map((idea) => idea.title);
      savedAt.current = Date.now();
      savedDay.current = todayIso();
      setResult(next);
      setShown(more ? [...shown, ...titles] : titles);
      setAdded(new Set());
      setPhase("ready");
    } catch (err) {
      if (id !== requestId.current) return;
      toast.error(errorMessage(err, "Couldn't get meal ideas right now. Please try again."));
      setPhase(result ? "ready" : "idle");
    }
  }

  async function addIdea(idea: DietCoachIdea) {
    if (!result || adding) return;
    setAdding(idea.title);
    try {
      const token = newToken();
      await api.diet.addItems({
        meal_type: result.meal_type,
        items: idea.items.map((item, index) => ({ food_id: item.food_id, quantity: item.quantity, unit: item.unit, client_token: `${token}-${index}` })),
      });
      setAdded((previous) => new Set(previous).add(idea.title));
      toast.success(`Added to ${mealLabel(result.meal_type)}.`);
      onLogged();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't add this meal. Please try again."));
    } finally {
      setAdding(null);
    }
  }

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
        <button type="submit" className="btn btn-brand btn-sm dt-coach-ask" disabled={phase === "loading"}>
          <Stars size={13} /> {phase === "loading" ? "Thinking…" : result ? "Ask again" : "Suggest meals"}
        </button>
      </form>

      {phase === "idle" && !result && (
        <p className="dt-coach-lead">Not sure what to eat next? Get meal ideas that fit what you have left today, what you like and what you usually eat.</p>
      )}

      {phase === "loading" && (
        <div className="dt-coach-ideas" role="status" aria-live="polite" aria-label="Finding meal ideas">
          <DietSkeleton height={190} />
          <DietSkeleton height={190} className="d-none d-lg-block" />
          <DietSkeleton height={190} className="d-none d-lg-block" />
        </div>
      )}

      {phase !== "loading" && result && (
        <>
          <p className="dt-coach-meta">
            Ideas for <strong>{mealLabel(result.meal_type)}</strong>, aiming for about <strong>{fmt(result.budget.calories)}</strong> kcal
            {" "}and <strong>{fmt(result.budget.protein_g)}</strong> g protein.
          </p>
          {result.notice && <p className="dt-coach-notice">{result.notice}</p>}

          {result.ideas.length > 0 && (
            <ol className="dt-coach-ideas" aria-label="Meal ideas">
              {result.ideas.map((idea) => {
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
                      <span className="dt-coach-kcal"><strong>{fmt(idea.totals.calories)}</strong> kcal</span>
                      <span className="dt-coach-macros">P {fmt(idea.totals.protein_g)} · C {fmt(idea.totals.carbs_g)} · F {fmt(idea.totals.fat_g)} · Fibre {fmt(idea.totals.fibre_g)}</span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-soft btn-sm dt-coach-add"
                      disabled={isAdded || adding !== null}
                      onClick={() => void addIdea(idea)}
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
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void ask(true)}>
                Show different ideas
              </button>
            )}
            <p className="dt-coach-small">
              {allBasic && "The coach couldn't be reached, so these are quick ideas built from your food library. "}
              {result.disclaimer}
            </p>
          </div>
        </>
      )}
    </section>
  );
}
