import { useEffect, useRef, useState } from "react";
import { ExclamationTriangleFill, InfoCircle, Search, Trash } from "react-bootstrap-icons";

import { api } from "@/api";
import type { DiaryMeal, Food, FoodLogProposal, ProposalItem } from "@/api";
import { useToast } from "@/context/ToastContext";
import { MEAL_OPTIONS, errorMessage, fmt, mealLabel } from "@/pages/diet/dietMath";
import "./ProposalReview.scss";

interface ProposalReviewProps {
  proposal: FoodLogProposal;
  onChange: (proposal: FoodLogProposal) => void;
  onConfirmed: (meal: DiaryMeal) => void;
  onDiscarded: () => void;
}

/** Picks a food for an item the library couldn't match, or swaps a wrong match. */
function FoodFinder({ onPick }: { onPick: (food: Food) => void }) {
  const [text, setText] = useState("");
  const [hits, setHits] = useState<Food[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    const query = text.trim();
    if (!query) {
      setHits([]);
      return;
    }
    const id = ++seq.current;
    const timer = window.setTimeout(() => {
      api.diet
        .searchFoods(query, 6)
        .then((result) => id === seq.current && setHits(result.map((h) => h.food)))
        .catch(() => id === seq.current && setHits([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [text]);

  return (
    <div className="dt-pr-finder">
      <div className="dt-pr-finder-input">
        <Search size={13} aria-hidden="true" />
        <input className="form-control form-control-sm" placeholder="Search for the right food" aria-label="Search for the right food" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      {hits.length > 0 && (
        <ul className="dt-pr-finder-list">
          {hits.map((food) => (
            <li key={food.id}>
              <button type="button" onClick={() => onPick(food)}>{food.name}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface ItemRowProps {
  item: ProposalItem;
  busy: boolean;
  onEdit: (edit: { food_id?: number; quantity?: number; unit?: string; remove?: boolean }) => void;
}

function ItemRow({ item, busy, onEdit }: ItemRowProps) {
  const [quantity, setQuantity] = useState(item.quantity === null ? "" : String(item.quantity));
  const [finding, setFinding] = useState(false);

  // The server owns the amount; when it sends a new one (after a correction, say), show that.
  useEffect(() => {
    setQuantity(item.quantity === null ? "" : String(item.quantity));
  }, [item.quantity, item.unit, item.food_id]);

  const unit = item.unit ?? item.units[1] ?? "g";
  const commitQuantity = () => {
    const amount = Number(quantity);
    if (busy || quantity.trim() === "" || !(amount > 0) || amount === item.quantity) return; // one edit at a time: Enter then blur must not send twice
    onEdit({ quantity: amount, unit });
  };

  return (
    <li className={`dt-pr-item is-${item.status}`}>
      <div className="dt-pr-item-head">
        <div className="dt-pr-item-name">
          <strong>{item.name || item.text}</strong>
          {item.name && item.text.toLowerCase() !== item.name.toLowerCase() && <span className="dt-pr-said">you said “{item.text}”</span>}
        </div>
        <button type="button" className="dt-pr-remove" disabled={busy} aria-label={`Remove ${item.name || item.text}`} onClick={() => onEdit({ remove: true })}>
          <Trash size={14} />
        </button>
      </div>

      {item.status !== "unmatched" && (
        <div className="dt-pr-amount">
          <label className="visually-hidden" htmlFor={`dt-pr-q-${item.index}`}>Amount of {item.name}</label>
          <input
            id={`dt-pr-q-${item.index}`}
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            className={`form-control form-control-sm dt-pr-qty${item.status === "needs_quantity" ? " is-invalid" : ""}`}
            value={quantity}
            disabled={busy}
            onChange={(e) => setQuantity(e.target.value)}
            onBlur={commitQuantity}
            onKeyDown={(e) => e.key === "Enter" && commitQuantity()}
          />
          <label className="visually-hidden" htmlFor={`dt-pr-u-${item.index}`}>Unit for {item.name}</label>
          <select
            id={`dt-pr-u-${item.index}`}
            className="form-select form-select-sm dt-pr-unit"
            value={item.unit ?? ""}
            disabled={busy}
            onChange={(e) => {
              const amount = Number(quantity);
              if (amount > 0) onEdit({ quantity: amount, unit: e.target.value });
            }}
          >
            {item.unit === null && <option value="">Choose unit</option>}
            {item.units.map((u) => <option key={u} value={u}>{u === "g" ? "grams" : u}</option>)}
          </select>
          {item.nutrients && (
            <span className="dt-pr-nutrition">
              <strong>{fmt(item.nutrients.calories)} kcal</strong>
              <span>P {fmt(item.nutrients.protein_g, 1)} · C {fmt(item.nutrients.carbs_g, 1)} · F {fmt(item.nutrients.fat_g, 1)}</span>
            </span>
          )}
        </div>
      )}

      {item.note && (
        <p className="dt-pr-note">
          {item.status === "resolved" ? <InfoCircle size={12} aria-hidden="true" /> : <ExclamationTriangleFill size={12} aria-hidden="true" />} {item.note}
        </p>
      )}

      {(item.status === "unmatched" || finding || item.candidates.length > 0) && (
        <div className="dt-pr-alt">
          {item.candidates.length > 0 && !finding && (
            <>
              <span className="dt-pr-alt-label">{item.status === "unmatched" ? "Did you mean" : "Or"}</span>
              {item.candidates.map((food) => (
                <button key={food.id} type="button" className="dt-pr-alt-chip" disabled={busy} onClick={() => onEdit({ food_id: food.id })}>{food.name}</button>
              ))}
            </>
          )}
          {item.status !== "unmatched" && !finding && (
            <button type="button" className="dt-pr-link" onClick={() => setFinding(true)}>Pick a different food</button>
          )}
          {(item.status === "unmatched" || finding) && (
            <FoodFinder
              onPick={(food) => {
                setFinding(false);
                onEdit({ food_id: food.id });
              }}
            />
          )}
        </div>
      )}
    </li>
  );
}

export function ProposalReview({ proposal, onChange, onConfirmed, onDiscarded }: ProposalReviewProps) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [correction, setCorrection] = useState("");
  const root = useRef<HTMLElement>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const inFlight = useRef(0);

  // A new proposal appears below the form: bring it into view and give it focus so it is announced.
  useEffect(() => {
    root.current?.focus();
    root.current?.scrollIntoView({ block: "nearest" });
  }, []);

  /** Server calls run one after another, so a confirm can never overtake the edit that was typed just before it. */
  function run<T>(action: () => Promise<T>, failure: string): Promise<T | null> {
    inFlight.current += 1;
    setBusy(true);
    const task = queue.current.then(async () => {
      try {
        return await action();
      } catch (err) {
        toast.error(errorMessage(err, failure));
        return null;
      } finally {
        inFlight.current -= 1;
        if (inFlight.current === 0) setBusy(false);
      }
    });
    queue.current = task;
    return task;
  }

  const editItem = async (index: number, edit: { food_id?: number; quantity?: number; unit?: string; remove?: boolean }) => {
    const next = await run(() => api.diet.editProposal(proposal.proposal_id, { items: [{ index, ...edit }] }), "Couldn't update that item.");
    if (next) onChange(next);
  };

  const changeMeal = async (mealType: string) => {
    const next = await run(() => api.diet.editProposal(proposal.proposal_id, { meal_type: mealType }), "Couldn't change the meal.");
    if (next) onChange(next);
  };

  const revise = async (event: React.FormEvent) => {
    event.preventDefault();
    const message = correction.trim();
    if (!message) return;
    const next = await run(() => api.diet.reviseProposal(proposal.proposal_id, message), "Couldn't apply that change.");
    if (next) {
      onChange(next);
      setCorrection("");
    }
  };

  const confirm = async () => {
    const result = await run(() => api.diet.confirmProposal(proposal.proposal_id), "Couldn't save this meal. Please try again.");
    if (result) {
      toast.success(`Saved to ${mealLabel(result.meal.meal_type).toLowerCase()}.`);
      onConfirmed(result.meal);
    }
  };

  const discard = async () => {
    const ok = await run(async () => {
      await api.diet.dismissProposal(proposal.proposal_id);
      return true;
    }, "Couldn't discard this.");
    if (ok) onDiscarded(); // if the server refused, it is still pending and stays on screen
  };

  return (
    <section ref={root} tabIndex={-1} className="surface dt-pr" aria-label="Review before saving">
      <header className="dt-pr-head">
        <div>
          <h3>Check this before it's saved</h3>
          <p>Nothing is counted until you confirm. Amounts and nutrition are estimates you can correct.</p>
        </div>
        <label className="dt-pr-meal">
          <span className="visually-hidden">Meal</span>
          <select className="form-select form-select-sm" value={MEAL_OPTIONS.some((o) => o.value === proposal.meal_type) ? proposal.meal_type : ""} disabled={busy} onChange={(e) => void changeMeal(e.target.value)}>
            {!MEAL_OPTIONS.some((o) => o.value === proposal.meal_type) && <option value="">{mealLabel(proposal.meal_type)}</option>}
            {MEAL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      </header>

      {proposal.warnings.length > 0 && (
        <ul className="dt-pr-warnings" role="alert">
          {proposal.warnings.map((warning) => (
            <li key={warning}><ExclamationTriangleFill size={13} aria-hidden="true" /> {warning}</li>
          ))}
        </ul>
      )}

      {proposal.items.length === 0 ? (
        <p className="dt-pr-empty">Every item was removed. Discard this, or add a correction below to put something back.</p>
      ) : (
        <ul className="dt-pr-items">
          {proposal.items.map((item) => (
            <ItemRow key={`${item.index}-${item.food_id ?? "x"}`} item={item} busy={busy} onEdit={(edit) => void editItem(item.index, edit)} />
          ))}
        </ul>
      )}

      {proposal.clarifications.length > 0 && (
        <ul className="dt-pr-questions" aria-label="Questions">
          {proposal.clarifications.map((q) => <li key={q}>{q}</li>)}
        </ul>
      )}

      <form className="dt-pr-correct" onSubmit={revise}>
        <label htmlFor="dt-pr-correction" className="visually-hidden">Tell me what to change</label>
        <input
          id="dt-pr-correction"
          className="form-control form-control-sm"
          placeholder="Need a change? e.g. “Actually 3 chapatis” or “remove the rice”"
          value={correction}
          maxLength={500}
          disabled={busy}
          onChange={(e) => setCorrection(e.target.value)}
        />
        <button type="submit" className="btn btn-soft btn-sm" disabled={busy || !correction.trim()}>Apply</button>
      </form>

      <footer className="dt-pr-foot">
        <div className="dt-pr-total" aria-live="polite">
          <strong>{fmt(proposal.totals.calories)} kcal</strong>
          <span>P {fmt(proposal.totals.protein_g, 1)} · C {fmt(proposal.totals.carbs_g, 1)} · F {fmt(proposal.totals.fat_g, 1)} · Fibre {fmt(proposal.totals.fibre_g, 1)}</span>
          <span className="dt-pr-est">Estimated</span>
        </div>
        <div className="dt-pr-buttons">
          <button type="button" className="btn btn-outline-secondary" onClick={() => void discard()} disabled={busy}>Discard</button>
          <button type="button" className="btn btn-brand" onClick={() => void confirm()} disabled={!proposal.can_confirm}>
            {busy ? "Working…" : "Confirm and save"}
          </button>
        </div>
      </footer>
    </section>
  );
}
