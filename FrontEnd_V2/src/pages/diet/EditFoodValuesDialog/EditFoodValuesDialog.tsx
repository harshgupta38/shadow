import { useState } from "react";
import { Modal } from "react-bootstrap";
import { PlusLg, XLg } from "react-bootstrap-icons";

import { api } from "@/api";
import type { Food } from "@/api";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { useToast } from "@/context/ToastContext";
import { errorMessage, fmt } from "@/pages/diet/dietMath";
import "./EditFoodValuesDialog.scss";

interface EditFoodValuesDialogProps {
  food: Food;
  onClose: () => void;
  onSaved: (food: Food) => void;
}

type NutrientKey = "calories" | "protein_g" | "carbs_g" | "fat_g" | "fibre_g";

const NUTRIENTS: { key: NutrientKey; label: string; unit: string; max: number }[] = [
  { key: "calories", label: "Calories", unit: "kcal", max: 900 },
  { key: "protein_g", label: "Protein", unit: "g", max: 100 },
  { key: "carbs_g", label: "Carbohydrates", unit: "g", max: 100 },
  { key: "fat_g", label: "Fat", unit: "g", max: 100 },
  { key: "fibre_g", label: "Fibre", unit: "g", max: 100 },
];

const WEIGHT_UNIT_NAMES = new Set(["g", "gram", "grams", "kg", "mg", "oz"]);

interface ServingRow {
  id: number;
  name: string;
  grams: string;
}

/** Lets someone use their own values for a library food: their brand, their recipe, their roti size. Only they see the change. */
export function EditFoodValuesDialog({ food, onClose, onSaved }: EditFoodValuesDialogProps) {
  const toast = useToast();
  const [values, setValues] = useState<Record<NutrientKey, string>>({
    calories: String(food.calories),
    protein_g: String(food.protein_g),
    carbs_g: String(food.carbs_g),
    fat_g: String(food.fat_g),
    fibre_g: String(food.fibre_g),
  });
  const [servings, setServings] = useState<ServingRow[]>(() =>
    Object.entries(food.serving_grams).map(([name, grams], id) => ({ id, name, grams: String(grams) })),
  );
  const [nextId, setNextId] = useState(Object.keys(food.serving_grams).length);
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // The same rules the server applies, explained next to the field.
  const nutrientErrors: Partial<Record<NutrientKey | "total", string>> = {};
  for (const n of NUTRIENTS) {
    const text = values[n.key].trim();
    const v = Number(text);
    if ((text === "" && n.key !== "fibre_g") || !Number.isFinite(v) || v < 0 || v > n.max) nutrientErrors[n.key] = `Enter 0 to ${fmt(n.max)}.`;
  }
  const macroGrams = (["protein_g", "carbs_g", "fat_g", "fibre_g"] as const).reduce((sum, key) => sum + (Number(values[key]) || 0), 0);
  if (!Object.keys(nutrientErrors).length && macroGrams > 102) nutrientErrors.total = "Protein, carbs, fat and fibre can't add up to more than 100 g in 100 g of food.";

  const servingErrors: Record<number, string> = {};
  const seen = new Set<string>();
  for (const row of servings) {
    const name = row.name.trim().toLowerCase();
    const grams = Number(row.grams);
    if (!name || name.length > 20) servingErrors[row.id] = "Give the serving a short name.";
    else if (WEIGHT_UNIT_NAMES.has(name)) servingErrors[row.id] = "Use a name like piece, bowl or cup, not a unit of weight.";
    else if (seen.has(name)) servingErrors[row.id] = "Two servings have the same name.";
    else if (!(grams >= 0.1 && grams <= 5000)) servingErrors[row.id] = "Weight must be 0.1 to 5,000 g.";
    seen.add(name);
  }
  const valid = Object.keys(nutrientErrors).length === 0 && Object.keys(servingErrors).length === 0;

  async function save() {
    setSubmitted(true);
    if (!valid || busy) return;
    setBusy(true);
    try {
      const saved = await api.diet.saveFoodValues(food.id, {
        calories: Number(values.calories),
        protein_g: Number(values.protein_g),
        carbs_g: Number(values.carbs_g),
        fat_g: Number(values.fat_g),
        fibre_g: Number(values.fibre_g || 0),
        serving_grams: Object.fromEntries(servings.map((row) => [row.name.trim().toLowerCase(), Number(row.grams)])),
      });
      toast.success(`${saved.name} will use your values from now on. Meals you already logged keep theirs.`);
      onSaved(saved);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't save your values. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setBusy(true);
    try {
      const restored = await api.diet.resetFoodValues(food.id);
      toast.success(`${restored.name} is back to the library values.`);
      onSaved(restored);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't reset this food. Please try again."));
    } finally {
      setBusy(false);
      setConfirmReset(false);
    }
  }

  const shownError = (key: NutrientKey) => (submitted || values[key] !== "" ? nutrientErrors[key] : undefined);

  return (
    <>
      <Modal show onHide={onClose} centered scrollable backdrop="static" dialogClassName="dt-ev-dialog">
        <Modal.Header closeButton>
          <Modal.Title as="h2" className="dt-ev-title">Edit values for {food.name}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="dt-ev-intro">
            Use the numbers you actually go by. They apply to you only, whenever you search, log or say this food, and every other person keeps the library values.
            Meals you already logged keep the numbers they were saved with.
          </p>

          <h3 className="dt-ev-heading">Nutrition per 100 g</h3>
          <div className="row g-2">
            {NUTRIENTS.map((n) => {
              const error = shownError(n.key);
              const libraryValue = (food.defaults ?? food)[n.key]; // an unedited food's own values are the library's
              return (
                <div className="col-6 col-md-4" key={n.key}>
                  <label htmlFor={`dt-ev-${n.key}`} className="form-label">{n.label} ({n.unit})</label>
                  <input
                    id={`dt-ev-${n.key}`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    className={`form-control${error ? " is-invalid" : ""}`}
                    value={values[n.key]}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? `dt-ev-${n.key}-err` : undefined}
                    onChange={(e) => setValues((prev) => ({ ...prev, [n.key]: e.target.value }))}
                  />
                  {error && <div id={`dt-ev-${n.key}-err`} className="invalid-feedback">{error}</div>}
                  {String(libraryValue) !== values[n.key] && <div className="dt-ev-lib">Library: {fmt(libraryValue, 1)}</div>}
                </div>
              );
            })}
          </div>
          {nutrientErrors.total && <div className="alert alert-danger mt-3 mb-0" role="alert">{nutrientErrors.total}</div>}

          <h3 className="dt-ev-heading">Serving sizes</h3>
          <p className="dt-ev-hint">How much one piece, bowl or cup weighs for you. Leave the list empty to use the library's sizes.</p>
          <ul className="dt-ev-servings">
            {servings.map((row) => {
              const error = servingErrors[row.id];
              return (
                <li key={row.id}>
                  <div className="dt-ev-serving-row">
                    <label className="visually-hidden" htmlFor={`dt-ev-sn-${row.id}`}>Serving name</label>
                    <input
                      id={`dt-ev-sn-${row.id}`}
                      className={`form-control form-control-sm${error ? " is-invalid" : ""}`}
                      value={row.name}
                      maxLength={20}
                      placeholder="e.g. piece"
                      onChange={(e) => setServings((prev) => prev.map((r) => (r.id === row.id ? { ...r, name: e.target.value } : r)))}
                    />
                    <span className="dt-ev-eq" aria-hidden="true">=</span>
                    <label className="visually-hidden" htmlFor={`dt-ev-sg-${row.id}`}>Weight in grams</label>
                    <input
                      id={`dt-ev-sg-${row.id}`}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      className={`form-control form-control-sm dt-ev-grams${error ? " is-invalid" : ""}`}
                      value={row.grams}
                      onChange={(e) => setServings((prev) => prev.map((r) => (r.id === row.id ? { ...r, grams: e.target.value } : r)))}
                    />
                    <span className="dt-ev-unit">g</span>
                    <button type="button" className="dt-ev-remove" aria-label={`Remove the ${row.name || "new"} serving`} onClick={() => setServings((prev) => prev.filter((r) => r.id !== row.id))}>
                      <XLg size={12} />
                    </button>
                  </div>
                  {error && <div className="dt-ev-err" role="alert">{error}</div>}
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            className="btn btn-soft btn-sm"
            disabled={servings.length >= 20}
            onClick={() => {
              setServings((prev) => [...prev, { id: nextId, name: "", grams: "" }]);
              setNextId((n) => n + 1);
            }}
          >
            <PlusLg size={12} /> Add a serving size
          </button>
        </Modal.Body>
        <Modal.Footer className="dt-ev-footer">
          {food.is_edited ? (
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setConfirmReset(true)}>Reset to library values</button>
          ) : (
            <span />
          )}
          <div className="dt-ev-actions">
            <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="button" className="btn btn-brand" onClick={() => void save()} disabled={busy || (submitted && !valid)}>{busy ? "Saving…" : "Save my values"}</button>
          </div>
        </Modal.Footer>
      </Modal>

      <ConfirmDialog
        show={confirmReset}
        title="Go back to the library values?"
        message="Your own values for this food will be removed and the library's will be used again. Meals you already logged keep the numbers they were saved with."
        confirmLabel="Reset"
        busy={busy}
        onConfirm={() => void reset()}
        onCancel={() => setConfirmReset(false)}
      />
    </>
  );
}
