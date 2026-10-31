import { useEffect, useMemo, useState } from "react";
import { InfoCircleFill } from "react-bootstrap-icons";

import { api, ApiError } from "@/api";
import type { DietEstimate, DietProfile, DietProfileSaveRequest, DietSex, TargetSource } from "@/api";
import { useToast } from "@/context/ToastContext";
import { ChipInput } from "@/pages/diet/ChipInput/ChipInput";
import {
  ACTIVITY_OPTIONS,
  COOKING_OPTIONS,
  DIET_PREFERENCE_OPTIONS,
  OBJECTIVE_OPTIONS,
  TARGET_FIELDS,
  fmt,
} from "@/pages/diet/dietMath";
import "./OnboardingWizard.scss";

interface OnboardingWizardProps {
  /** Present when editing an existing profile; absent on first use. */
  initial?: DietProfile | null;
  onDone: (profile: DietProfile) => void;
  onCancel?: () => void;
}

type TargetKey = (typeof TARGET_FIELDS)[number]["key"];

interface FormState {
  age: string;
  sex: DietSex | "";
  height_cm: string;
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

const STEPS = ["About you", "Your goal", "Food preferences", "Daily targets"] as const;
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
  return {
    age: profile ? String(profile.age) : "",
    sex: profile?.sex ?? "",
    height_cm: profile ? String(profile.height_cm) : "",
    weight_kg: profile ? String(profile.weight_kg) : "",
    target_weight_kg: profile?.target_weight_kg ? String(profile.target_weight_kg) : "",
    activity_level: profile?.activity_level ?? "light",
    objective: profile?.objective ?? "maintenance",
    objective_note: profile?.objective_note ?? "",
    dietary_preference: profile?.dietary_preference ?? "no_preference",
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

export function OnboardingWizard({ initial, onDone, onCancel }: OnboardingWizardProps) {
  const toast = useToast();
  const editing = Boolean(initial);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(() => fromProfile(initial));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [estimate, setEstimate] = useState<DietEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [estimateTick, setEstimateTick] = useState(0); // bumped by "Try again"
  // Only what the user typed is stored. Every other number shown is derived, so it can't drift from what the server saves.
  const [edits, setEdits] = useState<Partial<Record<TargetKey, string>>>({});
  const [recalculate, setRecalculate] = useState(false);
  const [prescribed, setPrescribed] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  function validate(forStep: number): boolean {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (forStep === 0) {
      const age = Number(form.age);
      if (!Number.isInteger(age) || age < 14 || age > 100) next.age = "Enter an age between 14 and 100.";
      if (!form.sex) next.sex = "Choose one. It is only used in the calorie formula.";
      const h = Number(form.height_cm);
      if (!(h >= 100 && h <= 250)) next.height_cm = "Enter your height in cm (100–250).";
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
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  // The estimate runs whenever the targets step is open and the inputs it depends on change.
  const estimateKey = [form.age, form.sex, form.height_cm, form.weight_kg, form.activity_level, form.objective].join("|");
  useEffect(() => {
    if (step !== 3 || !form.sex) return;
    let live = true;
    setEstimating(true);
    setEstimateError(null);
    api.diet
      .estimate({
        age: Number(form.age),
        sex: form.sex,
        height_cm: Number(form.height_cm),
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

  async function save() {
    if (!targets || estimating || Object.keys(targetErrors).length > 0 || !form.sex) return;
    const overrides: Record<string, number | boolean> = {};
    touched.forEach((key) => {
      overrides[key] = Number(targets[key]);
    });
    const request: DietProfileSaveRequest = {
      age: Number(form.age),
      sex: form.sex,
      height_cm: Number(form.height_cm),
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

  const next = () => {
    if (validate(step)) setStep((s) => s + 1);
  };

  const field = (key: keyof FormState) => (errors[key] ? " is-invalid" : "");
  const feedback = (key: keyof FormState) => (errors[key] ? <div className="invalid-feedback d-block">{errors[key]}</div> : null);

  return (
    <div className="dt-wiz">
      <header className="dt-wiz-head">
        <h2>{editing ? "Profile and targets" : "Let's set up your nutrition"}</h2>
        <p>
          {editing
            ? "Update your details any time. Targets you set yourself are never changed unless you ask."
            : "A few questions so Shadow can suggest realistic daily targets. You can change everything later."}
        </p>
        <ol className="dt-wiz-steps" aria-label="Progress">
          {STEPS.map((label, index) => (
            <li key={label} className={index === step ? "is-current" : index < step ? "is-done" : ""} aria-current={index === step ? "step" : undefined}>
              <span className="dt-wiz-step-num">{index + 1}</span>
              <span className="dt-wiz-step-label">{label}</span>
            </li>
          ))}
        </ol>
      </header>

      <div className="surface dt-wiz-body">
        {step === 0 && (
          <div className="row g-3">
            <div className="col-6 col-md-3">
              <label htmlFor="dt-age" className="form-label">Age</label>
              <input id="dt-age" type="number" inputMode="numeric" className={`form-control${field("age")}`} value={form.age} onChange={(e) => set("age", e.target.value)} />
              {feedback("age")}
            </div>
            <div className="col-6 col-md-3">
              <label htmlFor="dt-sex" className="form-label">Sex</label>
              <select id="dt-sex" className={`form-select${field("sex")}`} value={form.sex} onChange={(e) => set("sex", e.target.value as DietSex | "")}>
                <option value="">Choose…</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
              </select>
              {feedback("sex")}
            </div>
            <div className="col-6 col-md-3">
              <label htmlFor="dt-height" className="form-label">Height (cm)</label>
              <input id="dt-height" type="number" inputMode="decimal" className={`form-control${field("height_cm")}`} value={form.height_cm} onChange={(e) => set("height_cm", e.target.value)} />
              {feedback("height_cm")}
            </div>
            <div className="col-6 col-md-3">
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
        )}

        {step === 1 && (
          <>
            <fieldset className="dt-wiz-options">
              <legend>What are you working towards?</legend>
              {OBJECTIVE_OPTIONS.map((o) => (
                <label key={o.value} className={`dt-wiz-option${form.objective === o.value ? " is-selected" : ""}`}>
                  <input type="radio" name="objective" value={o.value} checked={form.objective === o.value} onChange={() => set("objective", o.value)} />
                  <span><strong>{o.label}</strong><small>{o.hint}</small></span>
                </label>
              ))}
            </fieldset>
            {form.objective === "custom" && (
              <div className="mt-3">
                <label htmlFor="dt-objective-note" className="form-label">Describe it <span className="text-muted">· optional</span></label>
                <input id="dt-objective-note" className="form-control" maxLength={200} value={form.objective_note} onChange={(e) => set("objective_note", e.target.value)} />
              </div>
            )}
            <fieldset className="dt-wiz-options mt-4">
              <legend>How active are you?</legend>
              {ACTIVITY_OPTIONS.map((o) => (
                <label key={o.value} className={`dt-wiz-option${form.activity_level === o.value ? " is-selected" : ""}`}>
                  <input type="radio" name="activity" value={o.value} checked={form.activity_level === o.value} onChange={() => set("activity_level", o.value)} />
                  <span><strong>{o.label}</strong><small>{o.hint}</small></span>
                </label>
              ))}
            </fieldset>
          </>
        )}

        {step === 2 && (
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
        )}

        {step === 3 && (
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
        )}
      </div>

      <footer className="dt-wiz-foot">
        {step === 0 && onCancel ? (
          <button type="button" className="btn btn-outline-secondary" onClick={onCancel}>Cancel</button>
        ) : (
          <button type="button" className="btn btn-outline-secondary" disabled={step === 0 || saving} onClick={() => setStep((s) => s - 1)}>Back</button>
        )}
        {step < STEPS.length - 1 ? (
          <button type="button" className="btn btn-brand" onClick={next}>Continue</button>
        ) : (
          <button type="button" className="btn btn-brand" disabled={saving || estimating || !targets || Object.keys(targetErrors).length > 0} onClick={() => void save()}>
            {saving ? "Saving…" : editing ? "Save changes" : "Start tracking"}
          </button>
        )}
      </footer>
    </div>
  );
}
