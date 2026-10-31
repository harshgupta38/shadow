import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowRight, InfoCircleFill, Stars, X } from "react-bootstrap-icons";

import { api, ApiError } from "@/api";
import type {
  DietEstimate,
  DietHeightInput,
  DietHeightUnit,
  DietProfile,
  DietProfileSaveRequest,
  DietSex,
  TargetSource,
} from "@/api";
import { ThemeToggle } from "@/components/ui/ThemeToggle/ThemeToggle";
import { useToast } from "@/context/ToastContext";
import { ChipInput } from "@/pages/diet/ChipInput/ChipInput";
import {
  ACTIVITY_OPTIONS,
  COOKING_OPTIONS,
  DIET_PREFERENCE_OPTIONS,
  OBJECTIVE_OPTIONS,
  TARGET_FIELDS,
  feetAndInchesFromCm,
  fmt,
} from "@/pages/diet/dietMath";
import { useWizardBoy } from "@/pages/diet/OnboardingWizard/useWizardBoy";
import { GoalWizardVisual } from "@/pages/my_goals/GoalCreationWizard/GoalWizardVisual";
// The frame, stepper and journey picture are the goal setup wizard's, so this flow looks and moves the same way.
import "@/pages/my_goals/GoalCreationWizard/GoalCreationWizard.scss";
// The task type toggle's look, the same one the schedule wizard uses.
import "@/pages/my_goals/GoalTaskWizard/GoalTaskWizardPage.scss";
import "./OnboardingWizard.scss";

interface OnboardingWizardProps {
  /** Present when editing an existing profile; absent on first use. */
  initial?: DietProfile | null;
  onDone: (profile: DietProfile) => void;
  onCancel: () => void;
}

type TargetKey = (typeof TARGET_FIELDS)[number]["key"];

interface FormState {
  age: string;
  sex: DietSex | "";
  height_unit: DietHeightUnit;
  height_cm: string;
  height_feet: string;
  height_inches: string;
  weight_kg: string;
  target_weight_kg: string;
  activity_level: DietProfile["activity_level"];
  objective: DietProfile["objective"];
  objective_note: string;
  dietary_preference: DietProfile["dietary_preference"];
  allergies: string[];
  intolerances: string[];
  liked_foods: string[];
  disliked_foods: string[];
  cuisines: string[];
  meals_per_day: string;
  cooking_availability: DietProfile["cooking_availability"];
  daily_budget: string;
}

type FieldErrors = Partial<Record<keyof FormState, string>>;

const STEPS = [
  {
    title: "About you",
    question: "Tell us about yourself",
    helper: "Your details set your calorie estimate.",
  },
  {
    title: "Your goal",
    question: "What are you working towards?",
    helper: "This sets which way your calorie and macro targets lean.",
  },
  {
    title: "Food preferences",
    question: "How do you like to eat?",
    helper: "Shadow uses these to suggest foods and warn you about conflicts. Everything here is optional except meals per day.",
  },
  {
    title: "Daily targets",
    question: "Your daily targets",
    helper: "Estimated from your details and goal. A number you change stays as you set it.",
  },
] as const;
const LAST_STEP = STEPS.length - 1;

// The fields each step checks. Start tracking checks the steps in order and opens the first one with a problem.
const STEP_FIELDS: Partial<Record<number, (keyof FormState)[]>> = {
  0: ["age", "sex", "height_cm", "height_feet", "height_inches", "weight_kg", "target_weight_kg"],
  2: ["meals_per_day", "daily_budget"],
};

const HEIGHT_UNIT_OPTIONS: { value: DietHeightUnit; label: string }[] = [
  { value: "cm", label: "Centimetres" },
  { value: "ft_in", label: "Feet and inches" },
];

const SEX_OPTIONS: { value: DietSex; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

// The server's limits for each target (whole numbers).
const TARGET_LIMITS: Record<TargetKey, [number, number]> = {
  calorie_target: [500, 8000],
  protein_target_g: [10, 500],
  carbs_target_g: [0, 1000],
  fat_target_g: [10, 400],
  fibre_target_g: [5, 100],
  water_target_ml: [500, 10000],
};
const SOURCE_LABEL: Record<TargetSource, string> = { estimated: "Estimated", user: "Set by you", prescribed: "From your dietitian" };
const LOW_CALORIE_LIMIT = 1200;

function fromProfile(profile: DietProfile | null | undefined): FormState {
  // A saved height shows in both units, with the unit it was typed in selected.
  const imperial = profile ? feetAndInchesFromCm(profile.height_cm) : null;
  return {
    age: profile ? String(profile.age) : "",
    sex: profile?.sex ?? "male",
    height_unit: profile?.height_unit ?? "cm",
    height_cm: profile ? String(profile.height_cm) : "",
    height_feet: imperial ? String(imperial.feet) : "",
    height_inches: imperial ? String(imperial.inches) : "",
    weight_kg: profile ? String(profile.weight_kg) : "",
    target_weight_kg: profile?.target_weight_kg ? String(profile.target_weight_kg) : "",
    activity_level: profile?.activity_level ?? "light",
    objective: profile?.objective ?? "maintenance",
    objective_note: profile?.objective_note ?? "",
    dietary_preference: profile?.dietary_preference ?? "vegetarian",
    allergies: profile?.allergies ?? [],
    intolerances: profile?.intolerances ?? [],
    liked_foods: profile?.liked_foods ?? [],
    disliked_foods: profile?.disliked_foods ?? [],
    cuisines: profile?.cuisines ?? [],
    meals_per_day: profile ? String(profile.meals_per_day) : "3",
    cooking_availability: profile?.cooking_availability ?? "moderate",
    daily_budget: profile?.daily_budget != null ? String(profile.daily_budget) : "",
  };
}

function targetsFromProfile(profile: DietProfile): Record<TargetKey, string> {
  return {
    calorie_target: String(profile.calorie_target),
    protein_target_g: String(profile.protein_target_g),
    carbs_target_g: String(profile.carbs_target_g),
    fat_target_g: String(profile.fat_target_g),
    fibre_target_g: String(profile.fibre_target_g),
    water_target_ml: String(profile.water_target_ml),
  };
}

/** The height as typed. The server converts feet and inches to centimetres, so only the chosen unit is sent. */
function heightInput(form: FormState): DietHeightInput {
  return form.height_unit === "cm"
    ? { height_unit: "cm", height_cm: Number(form.height_cm) }
    : { height_unit: "ft_in", height_feet: Number(form.height_feet), height_inches: Number(form.height_inches) };
}

/** What a step asks for, checked the same way whether the user pressed Continue or Start tracking. */
function collectErrors(form: FormState, forStep: number): FieldErrors {
  const next: FieldErrors = {};
  if (forStep === 0) {
    const age = Number(form.age);
    if (!Number.isInteger(age) || age < 14 || age > 100) next.age = "Enter an age between 14 and 100.";
    if (!form.sex) next.sex = "Choose one. It is only used in the calorie formula.";
    if (form.height_unit === "cm") {
      const h = Number(form.height_cm);
      if (!(h >= 100 && h <= 250)) next.height_cm = "Enter your height in cm (100–250).";
    } else {
      const feet = Number(form.height_feet);
      const inches = Number(form.height_inches);
      if (!Number.isInteger(feet) || feet < 3 || feet > 8) next.height_feet = "Enter whole feet, 3 to 8.";
      if (!Number.isInteger(inches) || inches < 0 || inches > 11) next.height_inches = "Enter whole inches, 0 to 11.";
      // 3 ft 4 in is the shortest height of 100 cm or more, and 8 ft 2 in the tallest under 250 cm.
      const totalInches = feet * 12 + inches;
      if (!next.height_feet && !next.height_inches && (totalInches < 40 || totalInches > 98)) {
        next.height_feet = "Enter a height from 3 ft 4 in to 8 ft 2 in.";
      }
    }
    const w = Number(form.weight_kg);
    if (!(w >= 30 && w <= 300)) next.weight_kg = "Enter your weight in kg (30–300).";
    if (form.target_weight_kg.trim() !== "") {
      const t = Number(form.target_weight_kg);
      if (!(t >= 30 && t <= 300)) next.target_weight_kg = "Enter a target between 30 and 300 kg, or leave it blank.";
    }
  }
  if (forStep === 2) {
    const meals = Number(form.meals_per_day);
    if (!Number.isInteger(meals) || meals < 1 || meals > 8) next.meals_per_day = "Choose between 1 and 8 meals.";
    if (form.daily_budget.trim() !== "" && !(Number(form.daily_budget) >= 0)) next.daily_budget = "Use zero or more, or leave it blank.";
  }
  return next;
}

export function OnboardingWizard({ initial, onDone, onCancel }: OnboardingWizardProps) {
  const toast = useToast();
  const editing = Boolean(initial);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(() => fromProfile(initial));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [stepError, setStepError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<DietEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [estimateTick, setEstimateTick] = useState(0); // bumped by "Try again"
  // Only what the user typed is stored. Every other number shown is derived, so it can't drift from what the server saves.
  const [edits, setEdits] = useState<Partial<Record<TargetKey, string>>>({});
  const [recalculate, setRecalculate] = useState(false);
  const [prescribed, setPrescribed] = useState(false);
  const [saving, setSaving] = useState(false);
  const { boyStepIndex, isBoyVisible } = useWizardBoy(step);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  // Switching unit hides the other unit's fields, so their messages go too.
  function chooseHeightUnit(unit: DietHeightUnit) {
    setForm((prev) => ({ ...prev, height_unit: unit }));
    setErrors((prev) => ({ ...prev, height_cm: undefined, height_feet: undefined, height_inches: undefined }));
  }

  // Checks one step and shows its problems. The problems of other steps stay as they are until those steps are checked.
  function validate(forStep: number): boolean {
    const next = collectErrors(form, forStep);
    setErrors((prev) => {
      const kept: FieldErrors = { ...prev };
      for (const key of STEP_FIELDS[forStep] ?? []) delete kept[key];
      return { ...kept, ...next };
    });
    return Object.keys(next).length === 0;
  }

  // The estimate runs whenever the targets step is open and the inputs it depends on change. It waits for valid details.
  const estimateKey = [form.age, form.sex, form.height_unit, form.height_cm, form.height_feet, form.height_inches, form.weight_kg, form.activity_level, form.objective].join("|");
  useEffect(() => {
    if (step !== LAST_STEP) return;
    if (Object.keys(collectErrors(form, 0)).length > 0 || !form.sex) {
      setEstimate(null);
      return;
    }
    let live = true;
    setEstimating(true);
    setEstimateError(null);
    api.diet
      .estimate({
        age: Number(form.age),
        sex: form.sex,
        ...heightInput(form),
        weight_kg: Number(form.weight_kg),
        activity_level: form.activity_level,
        objective: form.objective,
      })
      .then((result) => {
        if (!live) return;
        setEstimate(result);
      })
      .catch((err) => live && setEstimateError(err instanceof ApiError ? err.message : "Couldn't work out your estimate."))
      .finally(() => live && setEstimating(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, estimateKey, estimateTick]);

  // Escape closes the wizard, the same as the goal flow's close button.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onCancel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, saving]);

  const estimateFor = (key: TargetKey): number | null => (estimate ? estimate.targets[key] : null);

  const touched = useMemo(() => new Set(Object.keys(edits) as TargetKey[]), [edits]);

  // What each target shows. Targets the user set earlier are kept (that is what the server does too), everything else follows
  // the latest estimate. "Replace with estimates" (recalculate) makes every untouched target follow the estimate.
  const targets = useMemo<Record<TargetKey, string> | null>(() => {
    const keepsSaved = (key: TargetKey) => Boolean(initial) && !recalculate && initial!.target_sources[key] !== "estimated";
    const saved = initial ? targetsFromProfile(initial) : null;
    const base = {} as Record<TargetKey, string>;
    for (const f of TARGET_FIELDS) {
      const kept = keepsSaved(f.key) && saved ? saved[f.key] : null;
      const fresh = estimate ? String(estimate.targets[f.key]) : saved ? saved[f.key] : null;
      const value = edits[f.key] ?? kept ?? fresh;
      if (value === null) return null;
      base[f.key] = value;
    }
    // The server scales estimated macros to a calorie target the user chose; show the same numbers it will save.
    const calories = Number(base.calorie_target);
    const calorieIsManual = edits.calorie_target !== undefined || keepsSaved("calorie_target");
    if (estimate && calorieIsManual && calories > 0) {
      const ratio = calories / estimate.targets.calorie_target;
      for (const key of ["protein_target_g", "carbs_target_g", "fat_target_g"] as const) {
        if (edits[key] === undefined && !keepsSaved(key)) base[key] = String(Math.max(1, Math.round(estimate.targets[key] * ratio)));
      }
    }
    return base;
  }, [edits, estimate, initial, recalculate]);

  // The same limits the server enforces, so a bad number is explained next to its field instead of failing at save.
  const targetErrors = useMemo(() => {
    const result: Partial<Record<TargetKey, string>> = {};
    if (!targets) return result;
    for (const field of TARGET_FIELDS) {
      const [min, max] = TARGET_LIMITS[field.key];
      const text = targets[field.key].trim();
      const value = Number(text);
      if (text === "" || !Number.isInteger(value) || value < min || value > max) {
        result[field.key] = `Enter a whole number from ${fmt(min)} to ${fmt(max)}.`;
      }
    }
    return result;
  }, [targets]);

  const lowCalories = targets !== null && Number(targets.calorie_target) > 0 && Number(targets.calorie_target) < LOW_CALORIE_LIMIT;

  function updateTarget(key: TargetKey, value: string) {
    setEdits((prev) => ({ ...prev, [key]: value }));
  }

  function useEstimates() {
    setEdits({});
    setRecalculate(true);
    setPrescribed(false);
  }

  // Start tracking checks every step. The first step with a missing or wrong detail opens, with its fields highlighted.
  async function save() {
    if (saving) return;
    const problems = { 0: collectErrors(form, 0), 2: collectErrors(form, 2) };
    const firstProblemStep = Object.keys(problems[0]).length > 0 ? 0 : Object.keys(problems[2]).length > 0 ? 2 : null;
    if (firstProblemStep !== null) {
      setErrors({ ...problems[0], ...problems[2] });
      setStep(firstProblemStep);
      setStepError("Some details are missing. Fill in the highlighted fields to start.");
      return;
    }
    if (!form.sex) return; // the check above has already caught this
    if (Object.keys(targetErrors).length > 0) {
      setStep(LAST_STEP);
      setStepError("Some targets are out of range. Fix the highlighted ones to start.");
      return;
    }
    if (!targets) {
      setStep(LAST_STEP);
      setStepError("Your targets aren't ready yet. Try again once the estimate loads.");
      return;
    }

    const overrides: Record<string, number | boolean> = {};
    touched.forEach((key) => {
      overrides[key] = Number(targets[key]);
    });
    const request: DietProfileSaveRequest = {
      age: Number(form.age),
      sex: form.sex,
      ...heightInput(form),
      weight_kg: Number(form.weight_kg),
      target_weight_kg: form.target_weight_kg.trim() === "" ? null : Number(form.target_weight_kg),
      activity_level: form.activity_level,
      objective: form.objective,
      objective_note: form.objective_note.trim(),
      dietary_preference: form.dietary_preference,
      allergies: form.allergies,
      intolerances: form.intolerances,
      liked_foods: form.liked_foods,
      disliked_foods: form.disliked_foods,
      cuisines: form.cuisines,
      meals_per_day: Number(form.meals_per_day),
      meal_times: initial?.meal_times ?? {},
      cooking_availability: form.cooking_availability,
      daily_budget: form.daily_budget.trim() === "" ? null : Number(form.daily_budget),
      targets: touched.size > 0 ? { ...(overrides as Record<string, number>), prescribed } : null,
      recalculate_targets: recalculate,
    };
    setSaving(true);
    try {
      const profile = await api.diet.saveProfile(request);
      toast.success(editing ? "Profile updated." : "Your nutrition profile is ready.");
      onDone(profile);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save your profile. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // Every step can be opened from the stepper. Continue checks the step it is on before moving to the next.
  function goTo(index: number) {
    if (saving || index === step) return;
    setStepError(null);
    setStep(index);
  }

  function next() {
    if (!validate(step)) {
      setStepError("Check the highlighted fields to continue.");
      return;
    }
    setStepError(null);
    setStep(step + 1);
  }

  const field = (key: keyof FormState) => (errors[key] ? " is-invalid" : "");
  const feedback = (key: keyof FormState) => (errors[key] ? <div className="invalid-feedback d-block">{errors[key]}</div> : null);

  function targetsStep(): ReactNode {
    return (
      <>
        {estimating && !targets && <p className="dt-wiz-aside" role="status">Working out your estimate…</p>}
        {estimateError && (
          <div className="alert alert-danger d-flex align-items-center justify-content-between gap-2" role="alert">
            <span>{estimateError}</span>
            <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setEstimateTick((n) => n + 1)}>Try again</button>
          </div>
        )}
        {estimate && (
          <p className="dt-wiz-summary">
            Your body burns about <strong>{fmt(estimate.bmr)} kcal</strong> a day at rest, and about <strong>{fmt(estimate.tdee)} kcal</strong> with your activity.
          </p>
        )}
        {estimate && estimate.notes.length > 0 && (
          <ul className="dt-wiz-notes">{estimate.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        )}
        {targets && (
          <div className="row g-3">
            {TARGET_FIELDS.map((f) => {
              const source: TargetSource = touched.has(f.key)
                ? prescribed ? "prescribed" : "user"
                : recalculate ? "estimated" : initial?.target_sources[f.key] ?? "estimated";
              const hint = estimateFor(f.key);
              return (
                <div className="col-6 col-md-4" key={f.key}>
                  <label htmlFor={`dt-t-${f.key}`} className="form-label">{f.label} ({f.unit})</label>
                  <input id={`dt-t-${f.key}`} type="number" inputMode="numeric" className={`form-control${targetErrors[f.key] ? " is-invalid" : ""}`} value={targets[f.key]} onChange={(e) => updateTarget(f.key, e.target.value)} />
                  {targetErrors[f.key] && <div className="invalid-feedback">{targetErrors[f.key]}</div>}
                  <div className="dt-wiz-source">
                    <span className={`pill${source === "estimated" ? "" : " pill-brand"}`}>{SOURCE_LABEL[source]}</span>
                    {hint !== null && String(hint) !== targets[f.key] && <span className="text-muted">estimate {fmt(hint)}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {lowCalories && (
          <div className="alert alert-warning mt-3" role="alert">
            {fmt(Number(targets?.calorie_target))} kcal is below {fmt(LOW_CALORIE_LIMIT)} kcal a day. Please speak to a doctor or dietitian before eating this little.
          </div>
        )}
        {touched.size > 0 && (
          <label className="dt-wiz-check">
            <input type="checkbox" checked={prescribed} onChange={(e) => setPrescribed(e.target.checked)} />
            <span>These numbers were prescribed by my doctor or dietitian</span>
          </label>
        )}
        {editing && estimate && (
          <button type="button" className="btn btn-ghost btn-sm mt-3" onClick={useEstimates}>Replace all targets with the new estimates</button>
        )}
        <p className="dt-wiz-disclaimer">{estimate?.disclaimer ?? "These are estimates for general wellbeing, not medical advice."}</p>
      </>
    );
  }

  // The fields of each step. Every step is rendered so its values are kept while the stepper is open; a step that is
  // not open is disabled as a whole.
  function stepFields(index: number): ReactNode {
    if (index === 0) {
      return (
        <div className="row g-3">
          <div className="col-12 col-md-6">
            <label htmlFor="dt-age" className="form-label">Age</label>
            <input id="dt-age" type="number" inputMode="numeric" className={`form-control${field("age")}`} value={form.age} onChange={(e) => set("age", e.target.value)} />
            {feedback("age")}
          </div>
          <div className="col-12 col-md-6">
            <label className="form-label">Sex</label>
            <div className="goal-task-type-toggle goal-task-type-toggle--compact mt-0">
              {SEX_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`goal-task-type-option ${form.sex === option.value ? "is-active" : ""}`.trim()}
                  onClick={() => set("sex", option.value)}
                  aria-pressed={form.sex === option.value}
                >
                  <span className="goal-task-type-option-title">{option.label}</span>
                </button>
              ))}
            </div>
            {feedback("sex")}
          </div>

          <div className="col-12 col-md-6">
            <label className="form-label">Height unit</label>
            <div className="goal-task-type-toggle goal-task-type-toggle--compact mt-0">
              {HEIGHT_UNIT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`goal-task-type-option ${form.height_unit === option.value ? "is-active" : ""}`.trim()}
                  onClick={() => chooseHeightUnit(option.value)}
                  aria-pressed={form.height_unit === option.value}
                >
                  <span className="goal-task-type-option-title">{option.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="col-12 col-md-6">
            {form.height_unit === "cm" ? (
              <>
                <label htmlFor="dt-height" className="form-label">Height (cm)</label>
                <input id="dt-height" type="number" inputMode="decimal" className={`form-control${field("height_cm")}`} value={form.height_cm} onChange={(e) => set("height_cm", e.target.value)} />
                {feedback("height_cm")}
              </>
            ) : (
              <div className="row g-2">
                <div className="col-6">
                  <label htmlFor="dt-height-feet" className="form-label">Feet</label>
                  <input id="dt-height-feet" type="number" inputMode="numeric" className={`form-control${field("height_feet")}`} value={form.height_feet} onChange={(e) => set("height_feet", e.target.value)} />
                  {feedback("height_feet")}
                </div>
                <div className="col-6">
                  <label htmlFor="dt-height-inches" className="form-label">Inches</label>
                  <input id="dt-height-inches" type="number" inputMode="numeric" className={`form-control${field("height_inches")}`} value={form.height_inches} onChange={(e) => set("height_inches", e.target.value)} />
                  {feedback("height_inches")}
                </div>
              </div>
            )}
          </div>

          <div className="col-12 col-md-6">
            <label htmlFor="dt-weight" className="form-label">Weight (kg)</label>
            <input id="dt-weight" type="number" inputMode="decimal" className={`form-control${field("weight_kg")}`} value={form.weight_kg} onChange={(e) => set("weight_kg", e.target.value)} />
            {feedback("weight_kg")}
          </div>
          <div className="col-12 col-md-6">
            <label htmlFor="dt-target-weight" className="form-label">Target weight (kg) <span className="text-muted">· optional</span></label>
            <input id="dt-target-weight" type="number" inputMode="decimal" className={`form-control${field("target_weight_kg")}`} value={form.target_weight_kg} onChange={(e) => set("target_weight_kg", e.target.value)} />
            {feedback("target_weight_kg")}
          </div>
          <div className="col-12">
            <p className="dt-wiz-aside"><InfoCircleFill size={13} aria-hidden="true" /> Your weight here is only used for the estimate. Weight history lives in Track Progress.</p>
          </div>
        </div>
      );
    }

    if (index === 1) {
      return (
        <>
          <fieldset className="dt-wiz-options">
            <legend>Your aim</legend>
            <div className="dt-wiz-grid">
              {OBJECTIVE_OPTIONS.map((o) => (
                <label key={o.value} className={`dt-wiz-option${form.objective === o.value ? " is-selected" : ""}`}>
                  <input type="radio" name="objective" value={o.value} checked={form.objective === o.value} onChange={() => set("objective", o.value)} />
                  <span><strong>{o.label}</strong><small>{o.hint}</small></span>
                </label>
              ))}
            </div>
          </fieldset>
          {form.objective === "custom" && (
            <div className="mt-3">
              <label htmlFor="dt-objective-note" className="form-label">Describe it <span className="text-muted">· optional</span></label>
              <input id="dt-objective-note" className="form-control" maxLength={200} value={form.objective_note} onChange={(e) => set("objective_note", e.target.value)} />
            </div>
          )}
          <fieldset className="dt-wiz-options mt-4">
            <legend>How active are you?</legend>
            <div className="dt-wiz-grid">
              {ACTIVITY_OPTIONS.map((o) => (
                <label key={o.value} className={`dt-wiz-option${form.activity_level === o.value ? " is-selected" : ""}`}>
                  <input type="radio" name="activity" value={o.value} checked={form.activity_level === o.value} onChange={() => set("activity_level", o.value)} />
                  <span><strong>{o.label}</strong><small>{o.hint}</small></span>
                </label>
              ))}
            </div>
          </fieldset>
        </>
      );
    }

    if (index === 2) {
      return (
        <div className="row g-3">
          <div className="col-12 col-md-6">
            <label htmlFor="dt-diet-pref" className="form-label">Eating style</label>
            <select id="dt-diet-pref" className="form-select" value={form.dietary_preference} onChange={(e) => set("dietary_preference", e.target.value as FormState["dietary_preference"])}>
              {DIET_PREFERENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="col-6 col-md-3">
            <label htmlFor="dt-meals" className="form-label">Meals per day</label>
            <input id="dt-meals" type="number" inputMode="numeric" min="1" max="8" className={`form-control${field("meals_per_day")}`} value={form.meals_per_day} onChange={(e) => set("meals_per_day", e.target.value)} />
            {feedback("meals_per_day")}
          </div>
          <div className="col-6 col-md-3">
            <label htmlFor="dt-cooking" className="form-label">Cooking</label>
            <select id="dt-cooking" className="form-select" value={form.cooking_availability} onChange={(e) => set("cooking_availability", e.target.value as FormState["cooking_availability"])}>
              {COOKING_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="col-12 col-md-6">
            <ChipInput id="dt-allergies" label="Food allergies" hint="Press Enter after each one, e.g. peanut, shellfish. You'll get a warning when a logged food may conflict." values={form.allergies} placeholder="Add an allergy" onChange={(v) => set("allergies", v)} />
          </div>
          <div className="col-12 col-md-6">
            <ChipInput id="dt-intolerances" label="Food intolerances" hint="e.g. lactose, gluten" values={form.intolerances} placeholder="Add an intolerance" onChange={(v) => set("intolerances", v)} />
          </div>
          <div className="col-12 col-md-6">
            <ChipInput id="dt-liked" label="Foods you like" values={form.liked_foods} placeholder="Add a food" onChange={(v) => set("liked_foods", v)} />
          </div>
          <div className="col-12 col-md-6">
            <ChipInput id="dt-disliked" label="Foods you dislike" values={form.disliked_foods} placeholder="Add a food" onChange={(v) => set("disliked_foods", v)} />
          </div>
          <div className="col-12 col-md-6">
            <ChipInput id="dt-cuisines" label="Favourite cuisines" hint="e.g. North Indian, South Indian, Italian" values={form.cuisines} placeholder="Add a cuisine" onChange={(v) => set("cuisines", v)} />
          </div>
          <div className="col-12 col-md-6">
            <label htmlFor="dt-budget" className="form-label">Daily food budget <span className="text-muted">· optional</span></label>
            <input id="dt-budget" type="number" inputMode="decimal" min="0" className={`form-control${field("daily_budget")}`} value={form.daily_budget} onChange={(e) => set("daily_budget", e.target.value)} />
            {feedback("daily_budget")}
          </div>
        </div>
      );
    }

    return targetsStep();
  }

  return (
    <div className="goal-wizard-backdrop">
      <div className="goal-wizard-page-theme-toggle">
        <ThemeToggle />
      </div>

      <section className="goal-wizard-shell" aria-labelledby="diet-wizard-title">
        <div className="goal-wizard-main">
          <header className="goal-wizard-header">
            <div className="goal-wizard-header-main">
              <button
                type="button"
                className="btn btn-ghost btn-icon goal-wizard-close"
                onClick={onCancel}
                aria-label="Close nutrition setup"
                disabled={saving}
              >
                <X size={30} />
              </button>
              <div className="goal-wizard-header-copy">
                <h3 id="diet-wizard-title">{editing ? "Profile and targets" : "Let's set up your nutrition"}</h3>
                <p>
                  {editing
                    ? "Update your details any time. Targets you set yourself are never changed unless you ask."
                    : "A few questions so Shadow can suggest realistic daily targets. You can change everything later."}
                </p>
              </div>
            </div>
          </header>

          <div className="goal-wizard-body">
            <aside className="goal-wizard-stepper" aria-label="Nutrition setup steps">
              {STEPS.map((item, index) => {
                const isActive = index === step;
                const isDone = index < step;

                return (
                  <div
                    key={item.title}
                    className={`goal-wizard-step-block ${isActive ? "is-active" : ""} ${isDone ? "is-done" : ""}`.trim()}
                  >
                    <button
                      type="button"
                      className={`goal-wizard-step ${isActive ? "is-active" : ""} ${isDone ? "is-done" : ""}`.trim()}
                      onClick={() => goTo(index)}
                      disabled={saving}
                      aria-current={isActive ? "step" : undefined}
                    >
                      <span className="goal-wizard-step-index">{isDone ? "✓" : index + 1}</span>
                      <span className="goal-wizard-step-copy">
                        <span className="goal-wizard-step-title">{item.title}</span>
                      </span>
                    </button>

                    <div className="goal-wizard-step-expand" aria-hidden={!isActive}>
                      <div className="goal-wizard-step-expand-inner">
                        <div className="goal-wizard-stage-header">
                          <h3>{item.question}</h3>
                          <p>{item.helper}</p>
                        </div>

                        <fieldset className="dt-wiz-fields" disabled={!isActive || saving}>
                          {stepFields(index)}
                        </fieldset>

                        <div className="goal-wizard-footer mt-3">
                          {index < LAST_STEP ? (
                            <button type="button" className="btn btn-brand btn-brand-custom" onClick={next} disabled={!isActive || saving}>
                              Continue <ArrowRight size={16} className="ms-1" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-brand btn-brand-custom"
                              onClick={() => void save()}
                              disabled={!isActive || saving || estimating}
                            >
                              {saving ? "Saving…" : editing ? "Save changes" : "Start tracking"} <Stars size={16} className="ms-1" />
                            </button>
                          )}

                          {isActive && stepError ? <div className="alert alert-danger goal-wizard-inline-error mb-0">{stepError}</div> : null}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </aside>
          </div>
        </div>

        <GoalWizardVisual mode="journey" boyStepIndex={boyStepIndex} isBoyVisible={isBoyVisible} />
      </section>
    </div>
  );
}
