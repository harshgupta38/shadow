import { useEffect, useMemo, useState } from "react";
import { Modal } from "react-bootstrap";

import { api } from "@/api";
import type { DiaryItem, Food } from "@/api";
import { ServingSelector } from "@/pages/diet/ServingSelector/ServingSelector";

interface EditItemDialogProps {
  item: DiaryItem | null;
  busy: boolean;
  onSave: (item: DiaryItem, quantity: number, unit: string) => void;
  onClose: () => void;
}

/** Changes the amount of a logged food. The preview scales the nutrients that were logged, which is also what the server does. */
export function EditItemDialog({ item, busy, onSave, onClose }: EditItemDialogProps) {
  const [liveServings, setLiveServings] = useState<Record<string, number>>({});
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");

  useEffect(() => {
    if (!item) return;
    setQuantity(String(item.quantity));
    setUnit(item.unit);
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

  const valid = Number(quantity) > 0;

  return (
    <Modal show={item !== null} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title as="h2" className="fs-5 fw-bold">Edit amount</Modal.Title>
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
            />
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="btn btn-brand" disabled={!valid || busy} onClick={() => item && onSave(item, Number(quantity), unit)}>
          {busy ? "Saving…" : "Save"}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
