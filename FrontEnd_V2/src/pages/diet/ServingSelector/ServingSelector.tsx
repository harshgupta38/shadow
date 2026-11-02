import { useEffect, useId, useRef, useState } from "react";

import type { Food, NutrientTotals } from "@/api";
import { NutritionFields } from "@/pages/diet/NutritionFields/NutritionFields";
import {
  fmt,
  gramsFor,
  nutrientStrings,
  nutrientsForGrams,
  nutrientsPerGram,
  parseNutrientStrings,
  previewNutrients,
  unitsFor,
  type CustomNutrition,
  type NutrientStrings,
} from "@/pages/diet/DietPage.constants";
import "./ServingSelector.scss";

interface ServingSelectorProps {
  food: Food;
  quantity: string;
  unit: string;
  onChange: (next: { quantity: string; unit: string }) => void;
  /** Only where the user may set the nutrition themselves: what they have typed for this amount, if anything. */
  nutrition?: CustomNutrition;
  onNutritionChange?: (next: CustomNutrition) => void;
}

/** Quantity and serving unit for one food, with the nutrients that amount gives. The preview is a convenience; the server computes what is saved.
 *  Where the host allows it, the nutrition can be replaced with the user's own numbers, which then follow the amount. */
export function ServingSelector({ food, quantity, unit, onChange, nutrition, onNutritionChange }: ServingSelectorProps) {
  const id = useId();
  const amount = Number(quantity);
  const preview = quantity.trim() === "" ? null : previewNutrients(food, amount, unit);
  const invalid = quantity.trim() !== "" && !(amount > 0);
  const grams = amount > 0 ? gramsFor(food, amount, unit) : null;

  const customizable = onNutritionChange !== undefined;
  const custom: NutrientTotals | null = nutrition && nutrition !== "invalid" ? nutrition : null;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<NutrientStrings | null>(null);
  const perGram = useRef<NutrientTotals | null>(null);
  const shown = custom ?? preview;

  // The user's numbers are per gram underneath, so changing the amount changes them in proportion.
  useEffect(() => {
    if (!perGram.current || grams === null) return;
    const next = nutrientsForGrams(perGram.current, grams);
    setDraft(nutrientStrings(next));
    onNutritionChange?.(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grams]);

  function openEditor() {
    const base = custom ?? preview;
    if (!base) return;
    setDraft(nutrientStrings(base));
    setOpen(true);
  }

  function changeDraft(next: NutrientStrings) {
    setDraft(next);
    const parsed = parseNutrientStrings(next);
    if (!parsed || grams === null) {
      perGram.current = null;
      onNutritionChange?.("invalid");
      return;
    }
    perGram.current = nutrientsPerGram(parsed, grams);
    onNutritionChange?.(parsed);
  }

  function useFoodValues() {
    perGram.current = null;
    setOpen(false);
    onNutritionChange?.(null);
  }

  return (
    <div className="dt-serving">
      <div className="dt-serving-inputs">
        <label htmlFor={`${id}-qty`} className="visually-hidden">Quantity of {food.name}</label>
        <input
          id={`${id}-qty`}
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          className={`form-control form-control-sm dt-serving-qty${invalid ? " is-invalid" : ""}`}
          value={quantity}
          onChange={(e) => onChange({ quantity: e.target.value, unit })}
        />
        <label htmlFor={`${id}-unit`} className="visually-hidden">Unit for {food.name}</label>
        <select
          id={`${id}-unit`}
          className="form-select form-select-sm dt-serving-unit"
          value={unit}
          onChange={(e) => onChange({ quantity, unit: e.target.value })}
        >
          {unitsFor(food).map((u) => (
            <option key={u} value={u}>
              {u === "g" ? "grams" : `${u}${food.serving_grams[u] ? ` (${fmt(food.serving_grams[u])} g)` : ""}`}
            </option>
          ))}
        </select>
      </div>
      <div className="dt-serving-preview" aria-live="polite">
        {shown ? (
          <>
            <strong>
              {fmt(shown.calories)} kcal{custom && <span className="dt-serving-edited" title="You set this nutrition yourself.">edited</span>}
            </strong>
            <span>P {fmt(shown.protein_g, 1)} · C {fmt(shown.carbs_g, 1)} · F {fmt(shown.fat_g, 1)}</span>
          </>
        ) : (
          <span className="text-muted">{invalid ? "Enter an amount above zero" : "Enter an amount"}</span>
        )}
      </div>

      {customizable && preview && !open && (
        <button type="button" className="btn btn-link btn-sm p-0 dt-serving-edit-link" onClick={openEditor}>
          Edit nutrition
        </button>
      )}

      {customizable && open && draft && (
        <div className="dt-serving-editor">
          <NutritionFields idPrefix={`${id}-nf`} value={draft} onChange={changeDraft} />
          <div className="dt-serving-editor-foot">
            <span>Used exactly as typed, and changes in proportion if you change the amount.</span>
            <button type="button" className="btn btn-link btn-sm p-0" onClick={useFoodValues}>Use the food's own values</button>
          </div>
        </div>
      )}
    </div>
  );
}
