import { useState } from "react";

import { api, ApiError } from "@/api";
import type { Food } from "@/api";
import { useToast } from "@/context/ToastContext";
import { CATEGORY_LABEL } from "@/pages/diet/dietMath";
import "./CustomFoodForm.scss";

interface CustomFoodFormProps {
  initialName?: string;
  /** Present when editing one of the user's own foods; its per-100 g values are shown per serving again. */
  editing?: Food;
  onCreated: (food: Food) => void;
  onCancel: () => void;
}

type FieldKey = "name" | "serving_label" | "serving_grams" | "calories" | "protein_g" | "carbs_g" | "fat_g" | "fibre_g";

const NUMBER_FIELDS: { key: Exclude<FieldKey, "name" | "serving_label">; label: string; unit: string; required?: boolean }[] = [
  { key: "serving_grams", label: "Serving size", unit: "g", required: true },
  { key: "calories", label: "Calories", unit: "kcal", required: true },
  { key: "protein_g", label: "Protein", unit: "g" },
  { key: "carbs_g", label: "Carbohydrates", unit: "g" },
  { key: "fat_g", label: "Fat", unit: "g" },
  { key: "fibre_g", label: "Fibre", unit: "g" },
];

function initialValues(initialName: string, editing?: Food): Record<FieldKey, string> {
  if (!editing) {
    return { name: initialName, serving_label: "serving", serving_grams: "100", calories: "", protein_g: "", carbs_g: "", fat_g: "", fibre_g: "" };
  }
  const [label, grams] = Object.entries(editing.serving_grams)[0] ?? ["serving", 100];
  const perServing = (per100: number) => String(Math.round(((per100 * grams) / 100 + Number.EPSILON) * 10) / 10);
  return {
    name: editing.name,
    serving_label: label,
    serving_grams: String(grams),
    calories: perServing(editing.calories),
    protein_g: perServing(editing.protein_g),
    carbs_g: perServing(editing.carbs_g),
    fat_g: perServing(editing.fat_g),
    fibre_g: perServing(editing.fibre_g),
  };
}

/** Adds or edits a food of the user's own, entered per serving the way a pack label shows it. */
export function CustomFoodForm({ initialName = "", editing, onCreated, onCancel }: CustomFoodFormProps) {
  const toast = useToast();
  const [values, setValues] = useState<Record<FieldKey, string>>(() => initialValues(initialName, editing));
  const [category, setCategory] = useState(editing?.category ?? "other");
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [busy, setBusy] = useState(false);

  const set = (key: FieldKey, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  function validate(): boolean {
    const next: Partial<Record<FieldKey, string>> = {};
    if (!values.name.trim()) next.name = "Give the food a name.";
    if (!values.serving_label.trim()) next.serving_label = "Name the serving, e.g. bar or cup.";
    if (!(Number(values.serving_grams) > 0)) next.serving_grams = "Enter the serving weight in grams.";
    if (values.calories.trim() === "" || !(Number(values.calories) >= 0)) next.calories = "Enter the calories per serving.";
    for (const key of ["protein_g", "carbs_g", "fat_g", "fibre_g"] as const) {
      if (values[key].trim() !== "" && !(Number(values[key]) >= 0)) next[key] = "Use zero or more.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;
    setBusy(true);
    try {
      const payload = {
        name: values.name.trim(),
        serving_label: values.serving_label.trim(),
        serving_grams: Number(values.serving_grams),
        calories: Number(values.calories),
        protein_g: Number(values.protein_g || 0),
        carbs_g: Number(values.carbs_g || 0),
        fat_g: Number(values.fat_g || 0),
        fibre_g: Number(values.fibre_g || 0),
        category,
      };
      const food = editing ? await api.diet.updateFood(editing.id, payload) : await api.diet.createFood(payload);
      toast.success(editing ? `${food.name} updated. Meals you already logged keep their old values.` : `${food.name} added to your foods.`);
      onCreated(food);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Couldn't save this food. Please try again.";
      if (err instanceof ApiError && err.fieldErrors) setErrors((prev) => ({ ...prev, ...(err.fieldErrors as Partial<Record<FieldKey, string>>) }));
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="dt-custom" onSubmit={submit} noValidate>
      <p className="dt-custom-note">Enter the values for one serving, as printed on the pack. Foods you add are marked “Entered by you”.</p>

      <div className="row g-2">
        <div className="col-12 col-md-8">
          <label htmlFor="dt-cf-name" className="form-label">Food name</label>
          <input
            id="dt-cf-name"
            className={`form-control${errors.name ? " is-invalid" : ""}`}
            value={values.name}
            maxLength={140}
            onChange={(e) => set("name", e.target.value)}
            autoFocus
          />
          {errors.name && <div className="invalid-feedback">{errors.name}</div>}
        </div>
        <div className="col-12 col-md-4">
          <label htmlFor="dt-cf-label" className="form-label">Serving called</label>
          <input
            id="dt-cf-label"
            className={`form-control${errors.serving_label ? " is-invalid" : ""}`}
            value={values.serving_label}
            maxLength={20}
            onChange={(e) => set("serving_label", e.target.value)}
          />
          {errors.serving_label && <div className="invalid-feedback">{errors.serving_label}</div>}
        </div>
        <div className="col-12">
          <label htmlFor="dt-cf-category" className="form-label">Category</label>
          <select id="dt-cf-category" className="form-select" value={category} onChange={(e) => setCategory(e.target.value)}>
            {Object.entries(CATEGORY_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        {NUMBER_FIELDS.map((field) => (
          <div className="col-6 col-md-4" key={field.key}>
            <label htmlFor={`dt-cf-${field.key}`} className="form-label">
              {field.label} ({field.unit}){field.required ? "" : " · optional"}
            </label>
            <input
              id={`dt-cf-${field.key}`}
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              className={`form-control${errors[field.key] ? " is-invalid" : ""}`}
              value={values[field.key]}
              onChange={(e) => set(field.key, e.target.value)}
            />
            {errors[field.key] && <div className="invalid-feedback">{errors[field.key]}</div>}
          </div>
        ))}
      </div>

      <div className="dt-custom-actions">
        <button type="button" className="btn btn-outline-secondary" onClick={onCancel} disabled={busy}>{editing ? "Cancel" : "Back"}</button>
        <button type="submit" className="btn btn-brand" disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Save food"}</button>
      </div>
    </form>
  );
}
