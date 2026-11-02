import { useEffect, useMemo, useState } from "react";
import { Modal } from "react-bootstrap";

import { api } from "@/api";
import type { DiaryItem, Food, NutrientTotals } from "@/api";
import { CUSTOM_NUTRITION_SOURCE, type CustomNutrition } from "@/pages/diet/DietPage.constants";
import { ServingSelector } from "@/pages/diet/ServingSelector/ServingSelector";

interface EditItemDialogProps {
  item: DiaryItem | null;
  busy: boolean;
  onSave: (item: DiaryItem, quantity: number, unit: string, nutrition: { nutrients?: NutrientTotals; reset_nutrients?: boolean }) => void;
  onClose: () => void;
}

/** Changes the amount of a logged food, and optionally its nutrition. The preview scales the nutrients that were logged, which is also what the server does. */
export function EditItemDialog({ item, busy, onSave, onClose }: EditItemDialogProps) {
  const [liveServings, setLiveServings] = useState<Record<string, number>>({});
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [nutrition, setNutrition] = useState<CustomNutrition>(null);
  const [restore, setRestore] = useState(false); // bring back the food's own values in place of numbers the user typed earlier

  useEffect(() => {
    if (!item) return;
    setQuantity(String(item.quantity));
    setUnit(item.unit);
    setNutrition(null);
    setRestore(false);
    setLiveServings({});
    if (item.food_id) {
      api.diet.getFood(item.food_id).then((food) => setLiveServings(food.serving_grams)).catch(() => undefined);
    }
  }, [item]);

  // A stand-in food built from what was logged, so history keeps its own nutrition per gram.
  const snapshotFood: Food | null = useMemo(() => {
    if (!item || item.grams <= 0) return null;
    const per100 = 100 / item.grams;
    return {
      id: item.food_id ?? 0,
      name: item.name,
      alt_names: [],
      category: "",
      cuisine: "",
      prep_method: "",
      diet_tags: [],
      calories: item.calories * per100,
      protein_g: item.protein_g * per100,
      carbs_g: item.carbs_g * per100,
      fat_g: item.fat_g * per100,
      fibre_g: item.fibre_g * per100,
      serving_grams: { ...liveServings, [item.unit]: item.grams / item.quantity },
      default_unit: item.unit,
      default_quantity: item.quantity,
      source: item.nutrition_source,
      verification: item.verification,
      confidence: 1,
      is_custom: false,
      is_favourite: false,
      is_edited: false,
      defaults: null,
    };
  }, [item, liveServings]);

  const valid = Number(quantity) > 0 && nutrition !== "invalid";
  const hasOwnNumbers = item?.nutrition_source === CUSTOM_NUTRITION_SOURCE;

  return (
    <Modal show={item !== null} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title as="h2" className="fs-5 fw-bold">Edit amount and nutrition</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {item && snapshotFood && (
          <>
            <p className="fw-semibold mb-2">{item.name}</p>
            <ServingSelector
              food={snapshotFood}
              quantity={quantity}
              unit={unit}
              onChange={(next) => {
                setQuantity(next.quantity);
                setUnit(next.unit);
              }}
              nutrition={nutrition}
              onNutritionChange={restore ? undefined : setNutrition}
            />
            {hasOwnNumbers && nutrition === null && (
              <p className="small text-muted mt-2 mb-0">
                {restore ? (
                  <>The food's own values will replace the numbers you set. <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={() => setRestore(false)}>Keep my numbers</button></>
                ) : (
                  <>You set this nutrition yourself. <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={() => setRestore(true)}>Use the food's own values</button></>
                )}
              </p>
            )}
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="btn btn-brand" disabled={!valid || busy} onClick={() => {
          if (!item) return;
          onSave(item, Number(quantity), unit, restore ? { reset_nutrients: true } : nutrition && nutrition !== "invalid" ? { nutrients: nutrition } : {});
        }}>
          {busy ? "Saving…" : "Save"}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
