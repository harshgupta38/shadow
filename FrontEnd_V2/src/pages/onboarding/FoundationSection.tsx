import { FormEvent, useMemo, useState } from "react";

import { api, FoundationData, Gender } from "@/api";
import { ONBOARDING_FOUNDATION } from "@/constant/data";
import { Stars } from "react-bootstrap-icons";
import { useAuth } from "@/context/AuthContext";
import { ApiError } from "@/api/client";

interface FoundationSectionProps {
    onCompleted: () => void;
}

interface FoundationFormData {
    name: string;
    birthDay: string;
    birthMonth: string;
    birthYear: string;
    gender: Gender;
}

export function FoundationSection({ onCompleted }: FoundationSectionProps) {
    const { user } = useAuth();
    const currentYear = new Date().getFullYear();
    const minYear = ONBOARDING_FOUNDATION.MIN_YEAR;
    const defaultYear = String(currentYear - 18);

    const [form, setForm] = useState<FoundationFormData>({
        name: user?.name ?? "",
        birthDay: "",
        birthMonth: "",
        birthYear: defaultYear,
        gender: "",
    });
    const [submitted, setSubmitted] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

    const day = Number(form.birthDay);
    const month = Number(form.birthMonth);
    const year = Number(form.birthYear);

    const hasDobParts = !!form.birthDay && !!form.birthMonth && !!form.birthYear;
    const yearValid = Number.isInteger(year) && year >= minYear && year <= new Date().getFullYear();

    const constructedDob = hasDobParts && yearValid
        ? new Date(year, month - 1, day)
        : null;

    const calendarDateMatches = Boolean(
        constructedDob
        && constructedDob.getFullYear() === year
        && constructedDob.getMonth() === month - 1
        && constructedDob.getDate() === day,
    );

    const nameValid = Boolean(form.name.trim().length >= 2);
    const genderValid = form.gender === "male" || form.gender === "female";

    const dobValid = Boolean(
        calendarDateMatches
        && constructedDob
        && constructedDob <= new Date(),
    );

    const canContinue = useMemo(
        () => dobValid && nameValid && genderValid,
        [dobValid, nameValid, genderValid],
    );

    function getFieldError(field: keyof FoundationFormData): string | undefined {
        return fieldErrors[field];
    }

    function clearFieldError(field: keyof FoundationFormData) {
        setFieldErrors((current) => {
            if (!current[field]) return current;

            const next = { ...current };
            delete next[field];

            const remainingErrors = Object.values(next);
            setError(remainingErrors.length > 0 ? remainingErrors[0] : null);

            return next;
        });
    }

    function updateField<K extends keyof FoundationFormData>(key: K, value: FoundationFormData[K]) {
        clearFieldError(key);
        setForm((current) => ({ ...current, [key]: value }));
    }

    function spinYear(direction: 1 | -1) {
        const parsed = Number(form.birthYear);
        const baseYear = Number.isInteger(parsed) ? parsed : currentYear - 18;
        const nextYear = Math.min(currentYear, Math.max(minYear, baseYear + direction));
        updateField("birthYear", String(nextYear));
    }

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        setSubmitted(true);
        setError(null);
        setFieldErrors({});

        if (!canContinue) return;

        const selectedGender = form.gender;
        if (selectedGender !== "male" && selectedGender !== "female") return;

        const payload: FoundationData = {
            name: form.name.trim(),
            birthDay: form.birthDay,
            birthMonth: form.birthMonth,
            birthYear: form.birthYear,
            gender: selectedGender,
        };

        setIsSaving(true);
        try {
            await api.onboarding.saveFoundation(payload);
            onCompleted();
        } catch (err) {
            if (err instanceof ApiError) {
                setError(err.message);
                if (err.fieldErrors) setFieldErrors(err.fieldErrors);
            } else {
                setError("Unable to save details right now. Please try again.");
            }
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <section className="surface p-4 p-md-5">
            <div className="d-flex gap-3 mb-4 align-items-center">
                <span className="brand-mark" style={{ width: 40, height: 40, flexShrink: 0 }}>
                    <Stars size={20} />
                </span>
                <div>
                    <h1 className="h4 fw-bold mb-1">Foundation</h1>
                    <p className="text-muted-2 mb-0">Help us know you with a few quick basics.</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} noValidate>
                {isSaving && (
                    <div className="alert alert-info py-2 px-3" role="status">
                        Saving details, please wait...
                    </div>
                )}

                {error && (
                    <div className="alert alert-danger py-2 px-3" role="alert">
                        {error}
                    </div>
                )}

                <fieldset disabled={isSaving} className="border-0 p-0 m-0">
                    <div className="row g-3">
                        <div className="col-12">
                            <label className="form-label">Name</label>
                            <input
                                type="text"
                                className={`form-control ${submitted && !nameValid ? "is-invalid" : ""} ${getFieldError("name") ? "is-invalid" : ""}`}
                                placeholder="What should we call you?"
                                value={form.name}
                                onChange={(event) => updateField("name", event.target.value)}
                            />
                            {submitted && !nameValid && (
                                <div className="invalid-feedback d-block">Please enter a valid name.</div>
                            )}
                            {getFieldError("name") && (
                                <div className="invalid-feedback d-block">{getFieldError("name")}</div>
                            )}
                        </div>

                        <div className="col-12">
                            <label className="form-label">Date of birth</label>
                            <div className="row g-2">
                                <div className="col-12 col-md-3">
                                    <select
                                        className={`form-select ${submitted && !dobValid ? "is-invalid" : ""} ${getFieldError("birthDay") ? "is-invalid" : ""}`}
                                        value={form.birthDay}
                                        onChange={(event) => updateField("birthDay", event.target.value)}
                                        required
                                    >
                                        <option value="">Date</option>
                                        {ONBOARDING_FOUNDATION.DAY_OPTIONS.map((dayOption) => (
                                            <option key={dayOption} value={dayOption}>
                                                {dayOption}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="col-12 col-md-5">
                                    <select
                                        className={`form-select ${submitted && !dobValid ? "is-invalid" : ""} ${getFieldError("birthMonth") ? "is-invalid" : ""}`}
                                        value={form.birthMonth}
                                        onChange={(event) => updateField("birthMonth", event.target.value)}
                                        required
                                    >
                                        <option value="">Month</option>
                                        {ONBOARDING_FOUNDATION.MONTH_OPTIONS.map((monthOption) => (
                                            <option key={monthOption.value} value={monthOption.value}>
                                                {monthOption.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="col-12 col-md-4">
                                    <div
                                        className={`input-group ${submitted && !dobValid ? "is-invalid" : ""} ${getFieldError("birthYear") ? "is-invalid" : ""}`}
                                        role="group"
                                        aria-label="Birth year spinner"
                                    >
                                        <button
                                            type="button"
                                            className="btn btn-outline-secondary"
                                            onClick={() => spinYear(-1)}
                                            disabled={Number(form.birthYear) <= minYear}
                                            aria-label="Decrease year"
                                        >
                                            -
                                        </button>
                                        <input
                                            type="text"
                                            className={`form-control text-center ${getFieldError("birthYear") ? "is-invalid" : ""}`}
                                            inputMode="numeric"
                                            placeholder="Year"
                                            value={form.birthYear}
                                            onChange={(event) => updateField("birthYear", event.target.value.replace(/[^0-9]/g, ""))}
                                            required
                                        />
                                        <button
                                            type="button"
                                            className="btn btn-outline-secondary"
                                            onClick={() => spinYear(1)}
                                            disabled={Number(form.birthYear) >= currentYear}
                                            aria-label="Increase year"
                                        >
                                            +
                                        </button>
                                    </div>
                                </div>
                            </div>
                            {submitted && !dobValid && (
                                <div className="invalid-feedback d-block">Please enter a valid date of birth.</div>
                            )}
                            {(getFieldError("birthDay") || getFieldError("birthMonth") || getFieldError("birthYear")) && (
                                <div className="invalid-feedback d-block">
                                    {getFieldError("birthDay") || getFieldError("birthMonth") || getFieldError("birthYear")}
                                </div>
                            )}
                        </div>

                        <div className="col-12">
                            <label className="form-label">Gender</label>
                            <select
                                className={`form-select ${submitted && !genderValid ? "is-invalid" : ""} ${getFieldError("gender") ? "is-invalid" : ""}`}
                                value={form.gender}
                                onChange={(event) => updateField("gender", event.target.value as Gender)}
                            >
                                <option value="">Seelct Gender</option>
                                <option value="male">Male</option>
                                <option value="female">Female</option>
                            </select>
                            {submitted && !genderValid && (
                                <div className="invalid-feedback d-block">Please select your gender.</div>
                            )}
                            {getFieldError("gender") && (
                                <div className="invalid-feedback d-block">{getFieldError("gender")}</div>
                            )}
                        </div>
                    </div>

                    <div className="d-flex justify-content-end mt-4">
                        <button
                            type="submit"
                            className="btn btn-brand px-4"
                            disabled={isSaving}
                        >
                            {isSaving ? "Saving..." : "Continue"}
                        </button>
                    </div>
                </fieldset>
            </form>
        </section>
    );
}
