import { useEffect, useState } from "react";
import { Modal } from "react-bootstrap";
import { PencilSquare, Star, StarFill, Trash } from "react-bootstrap-icons";

import { api, ApiError } from "@/api";
import type { Food } from "@/api";
import { useToast } from "@/context/ToastContext";
import { ServingSelector } from "@/pages/diet/ServingSelector/ServingSelector";
import {
  MEAL_OPTIONS,
  VERIFICATION_LABEL,
  categoryLabel,
  certaintyFor,
  fmt,
  foodBadges,
  newToken,
  previewNutrients,
  suggestMealType,
} from "@/pages/diet/dietMath";
import { currentIstHour, todayIso } from "@/services/date.service";
import "./FoodDetailDialog.scss";

interface FoodDetailDialogProps {
  food: Food | null;
  onClose: () => void;
  onToggleFavourite: (food: Food) => void;
  onEdit: (food: Food) => void;
  onDelete: (food: Food) => void;
  onEditValues: (food: Food) => void;
}

/** Everything known about one food, plus a way to add it to today's diary. */
export function FoodDetailDialog({ food, onClose, onToggleFavourite, onEdit, onDelete, onEditValues }: FoodDetailDialogProps) {
  const toast = useToast();
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("g");
  const [meal, setMeal] = useState<string>("lunch");
  const [token, setToken] = useState(newToken);
  const [busy, setBusy] = useState(false);

  // A fresh amount and meal for each food that is opened.
  useEffect(() => {
    if (!food) return;
    setQuantity(String(food.default_quantity));
    setUnit(food.default_unit);
    setMeal(suggestMealType(currentIstHour()));
    setToken(newToken());
  }, [food?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!food) return null;

  const { diet, allergens } = foodBadges(food);
  // The usual-serving column only earns its place when it differs from per 100 g (a bowl or a piece, not "100 g" again).
  const sameAs100g = food.default_unit === "g" && food.default_quantity === 100;
  const perServing = sameAs100g ? null : previewNutrients(food, food.default_quantity, food.default_unit);
  const servings = Object.entries(food.serving_grams);
  const validAmount = Number(quantity) > 0;

  async function addToDiary() {
    if (!food || !validAmount || busy) return;
    setBusy(true);
    try {
      await api.diet.addItems({
        log_date: todayIso(),
        meal_type: meal,
        items: [{ food_id: food.id, quantity: Number(quantity), unit, certainty: certaintyFor(unit), client_token: token }],
      });
      setToken(newToken()); // adding it again later is a new entry, not a repeat of this one
      toast.success(`${food.name} added to ${MEAL_OPTIONS.find((m) => m.value === meal)?.label.toLowerCase() ?? meal}.`);
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't add this food. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal show onHide={onClose} centered scrollable dialogClassName="dt-fd-dialog">
      <Modal.Header closeButton>
        <Modal.Title as="h2" className="dt-fd-title">{food.name}</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <div className="dt-fd-tags">
          <span className="pill">{categoryLabel(food.category)}</span>
          {food.cuisine && <span className="pill">{food.cuisine === "indian" ? "Indian" : "International"}</span>}
          {diet && <span className="pill pill-success">{diet}</span>}
          <span className={`pill${food.verification === "user" ? " pill-brand" : ""}`}>{food.is_edited ? "Edited by you" : VERIFICATION_LABEL[food.verification]}</span>
        </div>

        {food.alt_names.length > 0 && <p className="dt-fd-alt">Also called {food.alt_names.slice(0, 6).join(", ")}</p>}

        <h3 className="dt-fd-heading">Nutrition</h3>
        <table className="dt-fd-table">
          <thead>
            <tr>
              <th scope="col"><span className="visually-hidden">Nutrient</span></th>
              <th scope="col">Per 100 g</th>
              {perServing && <th scope="col">Per {food.default_quantity === 1 ? "" : `${fmt(food.default_quantity, 2)} `}{food.default_unit}</th>}
            </tr>
          </thead>
          <tbody>
            {(
              [
                ["Calories", food.calories, perServing?.calories, "kcal"],
                ["Protein", food.protein_g, perServing?.protein_g, "g"],
                ["Carbohydrates", food.carbs_g, perServing?.carbs_g, "g"],
                ["Fat", food.fat_g, perServing?.fat_g, "g"],
                ["Fibre", food.fibre_g, perServing?.fibre_g, "g"],
              ] as [string, number, number | undefined, string][]
            ).map(([label, per100, serving, unitLabel]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{fmt(per100, 1)} {unitLabel}</td>
                {perServing && <td>{serving === undefined ? "" : `${fmt(serving, 1)} ${unitLabel}`}</td>}
              </tr>
            ))}
          </tbody>
        </table>

        {food.defaults && (
          <p className="dt-fd-lib">
            Library values: {fmt(food.defaults.calories)} kcal · P {fmt(food.defaults.protein_g, 1)} · C {fmt(food.defaults.carbs_g, 1)} · F {fmt(food.defaults.fat_g, 1)} per 100 g
          </p>
        )}

        {servings.length > 0 && (
          <>
            <h3 className="dt-fd-heading">Serving sizes</h3>
            <ul className="dt-fd-servings">
              {servings.map(([name, grams]) => {
                const n = previewNutrients(food, 1, name);
                return (
                  <li key={name}>
                    <span>1 {name}</span>
                    <span>{fmt(grams, 1)} g{n ? ` · ${fmt(n.calories)} kcal` : ""}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {allergens.length > 0 && <p className="dt-fd-note">Contains {allergens.join(", ")}. Allergen tags are best effort, so always check the ingredients.</p>}
        <p className="dt-fd-source">
          {food.is_edited
            ? "Your own values for this food, used whenever you log it. Only you see them."
            : food.verification === "user"
              ? "Entered by you."
            : food.verification === "verified"
              ? `${food.source}. Real values still vary by recipe, brand and portion.`
              : "Approximate typical values, not lab-verified. Real values vary by recipe, brand and portion."}
        </p>

        <h3 className="dt-fd-heading">Add to today's diary</h3>
        <div className="dt-fd-add">
          <ServingSelector food={food} quantity={quantity} unit={unit} onChange={(next) => { setQuantity(next.quantity); setUnit(next.unit); }} />
          <label className="visually-hidden" htmlFor="dt-fd-meal">Meal</label>
          <select id="dt-fd-meal" className="form-select form-select-sm dt-fd-meal" value={meal} onChange={(e) => setMeal(e.target.value)}>
            {MEAL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </Modal.Body>

      <Modal.Footer className="dt-fd-footer">
        <div className="dt-fd-tools">
          <button type="button" className={`btn btn-ghost btn-sm${food.is_favourite ? " is-fav" : ""}`} aria-pressed={food.is_favourite} onClick={() => onToggleFavourite(food)}>
            {food.is_favourite ? <StarFill size={13} /> : <Star size={13} />} {food.is_favourite ? "Favourite" : "Add to favourites"}
          </button>
          {!food.is_custom && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEditValues(food)}><PencilSquare size={13} /> Edit my values</button>
          )}
          {food.is_custom && (
            <>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEdit(food)}><PencilSquare size={13} /> Edit</button>
              <button type="button" className="btn btn-ghost btn-sm dt-fd-delete" onClick={() => onDelete(food)}><Trash size={13} /> Delete</button>
            </>
          )}
        </div>
        <button type="button" className="btn btn-brand" disabled={!validAmount || busy} onClick={() => void addToDiary()}>
          {busy ? "Adding…" : "Add to diary"}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
