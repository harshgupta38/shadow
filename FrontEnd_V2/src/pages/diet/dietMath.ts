import { ApiError } from "@/api";
import type {
  CookingAvailability,
  DietActivityLevel,
  DietaryPreference,
  DietObjective,
  Food,
  NutrientTotals,
  NutritionVerification,
} from "@/api";

export const MEAL_ORDER = ["breakfast", "morning_snack", "lunch", "evening_snack", "dinner"] as const;

const MEAL_LABEL: Record<string, string> = {
  breakfast: "Breakfast",
  morning_snack: "Morning snack",
  lunch: "Lunch",
  evening_snack: "Evening snack",
  dinner: "Dinner",
};

/** Standard meals have fixed names; a custom meal category is shown as the user typed it. */
export function mealLabel(mealType: string): string {
  if (MEAL_LABEL[mealType]) return MEAL_LABEL[mealType];
  const spaced = mealType.replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export const MEAL_OPTIONS = MEAL_ORDER.map((value) => ({ value, label: MEAL_LABEL[value] }));

/** The meal that fits the current hour, used only as a starting point the user can change. */
export function suggestMealType(hour: number): string {
  if (hour < 10.5) return "breakfast";
  if (hour < 12) return "morning_snack";
  if (hour < 15.5) return "lunch";
  if (hour < 18.5) return "evening_snack";
  return "dinner";
}

export function sortMeals<T extends { meal_type: string }>(meals: T[]): T[] {
  const rank = (type: string) => {
    const i = (MEAL_ORDER as readonly string[]).indexOf(type);
    return i === -1 ? MEAL_ORDER.length : i;
  };
  return [...meals].sort((a, b) => rank(a.meal_type) - rank(b.meal_type));
}

// ── Numbers ───────────────────────────────────────────────────────────────────

export function fmt(value: number, digits = 0): string {
  return value.toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

/** Bar width: 0–100, even when the real percentage overshoots. */
export function barPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  return Math.max(0, Math.min(100, percent));
}

export function round1(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

/** Nutrients for `quantity` of `unit` of a food, for instant previews. The saved values are always computed by the server. */
export function previewNutrients(food: Food, quantity: number, unit: string): NutrientTotals | null {
  if (!(quantity > 0)) return null;
  const grams = gramsFor(food, quantity, unit);
  if (grams === null) return null;
  const factor = grams / 100;
  return {
    calories: round1(food.calories * factor),
    protein_g: round1(food.protein_g * factor),
    carbs_g: round1(food.carbs_g * factor),
    fat_g: round1(food.fat_g * factor),
    fibre_g: round1(food.fibre_g * factor),
  };
}

const GRAM_UNITS: Record<string, number> = { g: 1, kg: 1000 };

export function gramsFor(food: Food, quantity: number, unit: string): number | null {
  const key = unit.trim().toLowerCase();
  if (key in GRAM_UNITS) return quantity * GRAM_UNITS[key];
  const perUnit = food.serving_grams[key];
  return perUnit === undefined ? null : quantity * perUnit;
}

export function unitsFor(food: Food): string[] {
  return ["g", ...Object.keys(food.serving_grams).filter((u) => u !== "g")];
}

/** Household measures are only approximate grams, so an amount in them is recorded as an estimate. */
const APPROXIMATE_UNITS = new Set(["bowl", "katori", "plate", "handful"]); // matches the server

export function certaintyFor(unit: string): "exact" | "estimated" {
  return APPROXIMATE_UNITS.has(unit.trim().toLowerCase()) ? "estimated" : "exact";
}

/** A short label for a quantity, e.g. "2 piece" -> "2 pieces", "150 g". */
export function quantityLabel(quantity: number, unit: string): string {
  const q = fmt(quantity, 2);
  if (unit === "g" || unit === "kg" || unit === "ml" || unit === "tsp" || unit === "tbsp") return `${q} ${unit}`;
  return `${q} ${unit}${quantity > 1 && !unit.endsWith("s") ? "s" : ""}`;
}

// ── Dates and times ───────────────────────────────────────────────────────────

export function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** "13:05:00" from the server -> "13:05" for a time input. */
export function toTimeInput(value: string | null): string {
  return value ? value.slice(0, 5) : "";
}

export function newToken(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// ── Labels ────────────────────────────────────────────────────────────────────

export const ACTIVITY_OPTIONS: { value: DietActivityLevel; label: string; hint: string }[] = [
  { value: "sedentary", label: "Mostly sitting", hint: "Desk job, little exercise" },
  { value: "light", label: "Lightly active", hint: "Light exercise 1–3 days a week" },
  { value: "moderate", label: "Moderately active", hint: "Exercise 3–5 days a week" },
  { value: "active", label: "Very active", hint: "Hard exercise 6–7 days a week" },
  { value: "very_active", label: "Extremely active", hint: "Physical job plus training" },
];

export const OBJECTIVE_OPTIONS: { value: DietObjective; label: string; hint: string }[] = [
  { value: "fat_loss", label: "Lose fat", hint: "A gentle, sustainable calorie deficit" },
  { value: "muscle_gain", label: "Build muscle", hint: "A small surplus with more protein" },
  { value: "maintenance", label: "Maintain weight", hint: "Eat about what you burn" },
  { value: "wellness", label: "General wellness", hint: "Balanced eating, no weight goal" },
  { value: "custom", label: "Something else", hint: "You set the numbers yourself" },
];

export const DIET_PREFERENCE_OPTIONS: { value: DietaryPreference; label: string }[] = [
  { value: "no_preference", label: "No preference" },
  { value: "vegetarian", label: "Vegetarian" },
  { value: "eggetarian", label: "Eggetarian" },
  { value: "vegan", label: "Vegan" },
  { value: "pescatarian", label: "Pescatarian" },
  { value: "jain", label: "Jain" },
];

export const COOKING_OPTIONS: { value: CookingAvailability; label: string }[] = [
  { value: "none", label: "I don't cook" },
  { value: "minimal", label: "Quick meals only" },
  { value: "moderate", label: "Some cooking" },
  { value: "plenty", label: "I enjoy cooking" },
];

export const VERIFICATION_LABEL: Record<NutritionVerification, string> = {
  verified: "Verified",
  estimated: "Estimate",
  user: "Entered by you",
};

export const TARGET_FIELDS = [
  { key: "calorie_target", label: "Calories", unit: "kcal" },
  { key: "protein_target_g", label: "Protein", unit: "g" },
  { key: "carbs_target_g", label: "Carbohydrates", unit: "g" },
  { key: "fat_target_g", label: "Fat", unit: "g" },
  { key: "fibre_target_g", label: "Fibre", unit: "g" },
  { key: "water_target_ml", label: "Water", unit: "ml" },
] as const;

export const WATER_QUICK_ML = [150, 250, 500] as const;

/** The server's own message when it sent one, otherwise a sentence the user can act on. */
export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

// ── Food library ──────────────────────────────────────────────────────────────

export const CATEGORY_LABEL: Record<string, string> = {
  bread: "Breads and rotis",
  grain: "Rice and grains",
  dal: "Dals",
  legume: "Legumes and pulses",
  vegetable: "Vegetables and sabzis",
  mixed_dish: "Mixed dishes",
  dairy: "Dairy and paneer",
  egg: "Eggs",
  meat: "Meat and chicken",
  fish: "Fish and seafood",
  fruit: "Fruits",
  snack: "Snacks",
  sweet: "Sweets and desserts",
  beverage: "Drinks",
  nuts_seeds: "Nuts and seeds",
  oil_fat: "Oils and fats",
  supplement: "Supplements",
  other: "Other",
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABEL[category] ?? mealLabel(category);
}

const DIET_CLASS_LABEL: Record<string, string> = {
  vegan: "Vegan",
  vegetarian: "Vegetarian",
  egg: "Contains egg",
  non_vegetarian: "Non-vegetarian",
};
const ALLERGEN_LABEL: Record<string, string> = {
  dairy: "dairy",
  gluten: "gluten",
  nuts: "tree nuts",
  peanut: "peanut",
  fish: "fish",
  shellfish: "shellfish",
  soy: "soy",
};

/** The eating-style badge and any allergens a food is tagged with. Tags are best effort: mixed dishes can hide ingredients. */
export function foodBadges(food: Food): { diet: string | null; allergens: string[] } {
  const diet = food.diet_tags.map((t) => DIET_CLASS_LABEL[t]).find(Boolean) ?? null;
  const allergens = food.diet_tags.filter((t) => t in ALLERGEN_LABEL).map((t) => ALLERGEN_LABEL[t]);
  return { diet, allergens };
}
