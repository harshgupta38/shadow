import { useEffect, useState } from "react";
import { Dropdown } from "react-bootstrap";
import { BookmarkPlus, PlusLg, ThreeDotsVertical, Trash, XLg } from "react-bootstrap-icons";

import type { DiaryItem, DiaryMeal } from "@/api";
import { MEAL_OPTIONS, fmt, mealLabel, quantityLabel, toTimeInput } from "@/pages/diet/dietMath";
import "./MealCard.scss";

interface MealCardProps {
  mealType: string;
  meal: DiaryMeal | null; // null: nothing logged for this meal yet
  readOnly?: boolean;
  onAdd: (mealType: string) => void;
  onEditItem: (item: DiaryItem) => void;
  onMoveItem: (item: DiaryItem, mealType: string) => void;
  onDuplicateItem: (item: DiaryItem) => void;
  onDeleteItem: (item: DiaryItem) => void;
  onSaveMeal: (meal: DiaryMeal) => void;
  onDeleteMeal: (meal: DiaryMeal) => void;
  onChangeTime: (meal: DiaryMeal, time: string) => void;
}

/** The time of a meal. Typing is kept locally and saved when you leave the field, so a half-typed time is never sent. */
function MealTime({ title, value, disabled, onCommit }: { title: string; value: string; disabled: boolean; onCommit: (time: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    if (draft === value) return;
    if (/^\d{2}:\d{2}$/.test(draft)) onCommit(draft);
    else setDraft(value); // an incomplete or cleared field goes back; the × button is how to remove a time on purpose
  };

  return (
    <span className="dt-meal-time">
      <input
        type="time"
        value={draft}
        disabled={disabled}
        aria-label={`Time of ${title}`}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
      {value && !disabled && (
        <button type="button" className="dt-meal-time-clear" aria-label={`Clear the time of ${title}`} onClick={() => onCommit("")}>
          <XLg size={10} />
        </button>
      )}
    </span>
  );
}

function isEstimate(item: DiaryItem): boolean {
  return item.verification === "estimated" || item.quantity_certainty === "estimated"; // values the user entered or edited are theirs
}

export function MealCard({
  mealType,
  meal,
  readOnly = false,
  onAdd,
  onEditItem,
  onMoveItem,
  onDuplicateItem,
  onDeleteItem,
  onSaveMeal,
  onDeleteMeal,
  onChangeTime,
}: MealCardProps) {
  const title = mealLabel(mealType);
  const moveTargets = MEAL_OPTIONS.filter((option) => option.value !== mealType);

  return (
    <section className={`surface dt-meal${meal ? "" : " is-empty"}`} aria-label={title}>
      <header className="dt-meal-head">
        <div className="dt-meal-title">
          <h3>{title}</h3>
          {meal && <MealTime title={title} value={toTimeInput(meal.eaten_at)} disabled={readOnly} onCommit={(time) => onChangeTime(meal, time)} />}
        </div>
        {meal ? (
          <div className="dt-meal-totals" aria-label={`${title} totals`}>
            <strong>{fmt(meal.totals.calories)} kcal</strong>
            <span>P {fmt(meal.totals.protein_g)} · C {fmt(meal.totals.carbs_g)} · F {fmt(meal.totals.fat_g)}</span>
          </div>
        ) : (
          <span className="dt-meal-none">Nothing logged</span>
        )}
      </header>

      {meal && (
        <ul className="dt-meal-items">
          {meal.items.map((item) => (
            <li key={item.id} className="dt-item">
              <div className="dt-item-main">
                <span className="dt-item-name">{item.name}</span>
                <span className="dt-item-qty">
                  {quantityLabel(item.quantity, item.unit)}
                  {item.unit !== "g" && ` · ${fmt(item.grams)} g`}
                  {isEstimate(item) && (
                    <span
                      className="dt-item-est"
                      title={
                        item.quantity_certainty === "estimated"
                          ? "The amount is approximate (a household measure)."
                          : "Nutrition for this food is an estimate, not a lab value."
                      }
                    >
                      est.
                    </span>
                  )}
                </span>
              </div>
              <div className="dt-item-nutrition">
                <strong>{fmt(item.calories)}</strong>
                <span>kcal</span>
              </div>
              {!readOnly && (
                <Dropdown align="end">
                  <Dropdown.Toggle as="button" className="dt-item-menu" aria-label={`Actions for ${item.name}`} bsPrefix="dt-no-caret">
                    <ThreeDotsVertical size={16} />
                  </Dropdown.Toggle>
                  <Dropdown.Menu>
                    <Dropdown.Item onClick={() => onEditItem(item)}>Edit amount</Dropdown.Item>
                    <Dropdown.Item onClick={() => onDuplicateItem(item)}>Duplicate</Dropdown.Item>
                    <Dropdown.Divider />
                    <Dropdown.Header>Move to</Dropdown.Header>
                    {moveTargets.map((option) => (
                      <Dropdown.Item key={option.value} onClick={() => onMoveItem(item, option.value)}>{option.label}</Dropdown.Item>
                    ))}
                    <Dropdown.Divider />
                    <Dropdown.Item className="text-danger" onClick={() => onDeleteItem(item)}>Remove</Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown>
              )}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
        <footer className="dt-meal-foot">
          <button type="button" className="btn btn-soft btn-sm" onClick={() => onAdd(mealType)}>
            <PlusLg size={12} /> Add food
          </button>
          {meal && (
            <>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onSaveMeal(meal)}>
                <BookmarkPlus size={13} /> Save as meal
              </button>
              <button type="button" className="btn btn-ghost btn-sm dt-meal-delete" onClick={() => onDeleteMeal(meal)}>
                <Trash size={13} /> Clear
              </button>
            </>
          )}
        </footer>
      )}
    </section>
  );
}
