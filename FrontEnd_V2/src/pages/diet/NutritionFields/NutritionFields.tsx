import { NUTRIENT_KEYS, parseNutrientStrings, type NutrientStrings } from "@/pages/diet/DietPage.constants";
import "./NutritionFields.scss";

interface NutritionFieldsProps {
  /** Makes the ids of the inputs unique when several items are on screen. */
  idPrefix: string;
  value: NutrientStrings;
  onChange: (next: NutrientStrings) => void;
  disabled?: boolean;
}

const FIELD_LABEL: Record<(typeof NUTRIENT_KEYS)[number], string> = {
  calories: "Calories (kcal)",
  protein_g: "Protein (g)",
  carbs_g: "Carbs (g)",
  fat_g: "Fat (g)",
  fibre_g: "Fibre (g)",
};

/** The five nutrition numbers for one amount of a food, as inputs. A field that can't be used yet is marked. */
export function NutritionFields({ idPrefix, value, onChange, disabled }: NutritionFieldsProps) {
  const allValid = parseNutrientStrings(value) !== null;
  return (
    <div className="dt-nf" role="group" aria-label="Nutrition for this amount">
      {NUTRIENT_KEYS.map((key) => {
        const raw = value[key].trim();
        const bad = !allValid && (raw === "" || !(Number(raw) >= 0));
        return (
          <div key={key} className="dt-nf-field">
            <label htmlFor={`${idPrefix}-${key}`} className="dt-nf-label">{FIELD_LABEL[key]}</label>
            <input
              id={`${idPrefix}-${key}`}
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              className={`form-control form-control-sm${bad ? " is-invalid" : ""}`}
              value={value[key]}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, [key]: e.target.value })}
            />
          </div>
        );
      })}
    </div>
  );
}
