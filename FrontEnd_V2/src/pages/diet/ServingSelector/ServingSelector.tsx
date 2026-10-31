import { useId } from "react";

import type { Food } from "@/api";
import { fmt, previewNutrients, unitsFor } from "@/pages/diet/dietMath";
import "./ServingSelector.scss";

interface ServingSelectorProps {
  food: Food;
  quantity: string;
  unit: string;
  onChange: (next: { quantity: string; unit: string }) => void;
}

/** Quantity and serving unit for one food, with the nutrients that amount gives. The preview is a convenience; the server computes what is saved. */
export function ServingSelector({ food, quantity, unit, onChange }: ServingSelectorProps) {
  const id = useId();
  const amount = Number(quantity);
  const preview = quantity.trim() === "" ? null : previewNutrients(food, amount, unit);
  const invalid = quantity.trim() !== "" && !(amount > 0);

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
        {preview ? (
          <>
            <strong>{fmt(preview.calories)} kcal</strong>
            <span>P {fmt(preview.protein_g, 1)} · C {fmt(preview.carbs_g, 1)} · F {fmt(preview.fat_g, 1)}</span>
          </>
        ) : (
          <span className="text-muted">{invalid ? "Enter an amount above zero" : "Enter an amount"}</span>
        )}
      </div>
    </div>
  );
}
