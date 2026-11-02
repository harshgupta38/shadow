import { Basket, Cookie, CupHot, MoonStarsFill, SunFill, Sunrise, type Icon } from "react-bootstrap-icons";

import type { DiaryHistoryDay, DiaryHistoryMeal } from "@/api";
import { MEAL_ORDER, mealLabel, quantityLabel, sortMeals } from "@/pages/diet/DietPage.constants";

export interface HistoryColumn {
  key: string;
  label: string;
  icon: Icon;
}

const SLOT_ICON: Record<(typeof MEAL_ORDER)[number], Icon> = {
  breakfast: Sunrise,
  morning_snack: CupHot,
  lunch: SunFill,
  evening_snack: Cookie,
  dinner: MoonStarsFill,
};

/** One column per standard meal, in the order the day goes. */
const STANDARD_COLUMNS: HistoryColumn[] = MEAL_ORDER.map((key) => ({ key, label: mealLabel(key), icon: SLOT_ICON[key] }));

const OTHER_COLUMN: HistoryColumn = { key: "other", label: "Other", icon: Basket };

function isStandard(mealType: string): boolean {
  return (MEAL_ORDER as readonly string[]).includes(mealType);
}

/** The standard meals, plus an "Other" column only when the month has a custom meal such as "Brunch". */
export function columnsFor(days: DiaryHistoryDay[]): HistoryColumn[] {
  const hasCustom = days.some((day) => day.meals.some((meal) => !isStandard(meal.meal_type)));
  return hasCustom ? [...STANDARD_COLUMNS, OTHER_COLUMN] : STANDARD_COLUMNS;
}

/** Equal columns for the standard meals; the "Other" column holds the odd custom meal, so it is kept narrow. */
export function columnsTemplate(columns: HistoryColumn[]): string {
  return columns.map((column) => (column.key === OTHER_COLUMN.key ? "minmax(0, 0.6fr)" : "minmax(0, 1fr)")).join(" ");
}

export function mealsInColumn(day: DiaryHistoryDay, column: HistoryColumn): DiaryHistoryMeal[] {
  const meals = column.key === OTHER_COLUMN.key ? day.meals.filter((meal) => !isStandard(meal.meal_type)) : day.meals.filter((meal) => meal.meal_type === column.key);
  return sortMeals(meals);
}

/** Every date of the month up to today, newest first. Days still to come have nothing to show. */
export function monthDates(month: string, today: string): string[] {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  const dates: string[] = [];
  for (let day = lastDay; day >= 1; day--) {
    const iso = `${month}-${String(day).padStart(2, "0")}`;
    if (iso <= today) dates.push(iso);
  }
  return dates;
}

/** "Rice, white (cooked) · Dal tadka": the foods of a meal on one line. */
export function foodsLine(meal: DiaryHistoryMeal): string {
  return meal.items.map((item) => item.name).join(" · ");
}

/** The hover text of a meal: each food with its amount. */
export function foodsTitle(meal: DiaryHistoryMeal): string {
  return meal.items.map((item) => `${item.name} (${quantityLabel(item.quantity, item.unit)})`).join("\n");
}
