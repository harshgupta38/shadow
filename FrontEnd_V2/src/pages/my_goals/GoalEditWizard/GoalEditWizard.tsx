import { useEffect, useMemo, useState } from "react";
import { X } from "react-bootstrap-icons";

import { api } from "@/api";
import { ApiError } from "@/api/client";
import type { GoalDetailResponse, UnderstandGoalResponse } from "@/api/types";
import { ThemeToggle } from "@/components/ui/ThemeToggle/ThemeToggle";
import { GoalWizardReview } from "@/pages/my_goals/GoalCreationWizard/GoalWizardReview";
import { GoalWizardVisual } from "@/pages/my_goals/GoalCreationWizard/GoalWizardVisual";

import "@/pages/my_goals/GoalCreationWizard/GoalCreationWizard.scss";

type GoalReviewFieldKey = keyof UnderstandGoalResponse;
type GoalReviewFieldErrors = Partial<Record<GoalReviewFieldKey, string>>;

const REVIEW_FIELD_KEYS: GoalReviewFieldKey[] = [
    "title",
    "summary",
    "category",
    "motivation",
    "success_definition",
    "current_state",
    "target_date",
    "challenges",
    "strengths",
    "success_metrics",
    "insights",
];

function mapToUnderstandGoalResponse(goal: GoalDetailResponse): UnderstandGoalResponse {
    return {
        title: goal.title,
        summary: goal.summary,
        category: goal.category,
        motivation: goal.motivation,
        success_definition: goal.success_definition,
        current_state: goal.current_state,
        challenges: goal.challenges,
        strengths: goal.strengths,
        target_date: goal.target_date,
        success_metrics: goal.success_metrics,
        insights: goal.insights,
    };
}

function mapFieldErrorsToReviewErrors(fieldErrors: Partial<Record<string, string>>): GoalReviewFieldErrors {
    const reviewFieldErrors: GoalReviewFieldErrors = {};

    for (const key of REVIEW_FIELD_KEYS) {
        const message = fieldErrors[key];
        if (typeof message === "string" && message.trim().length > 0) {
            reviewFieldErrors[key] = message;
        }
    }

    return reviewFieldErrors;
}

interface GoalEditWizardProps {
    open: boolean;
    goal: GoalDetailResponse;
    onClose: () => void;
    onUpdated?: (updated: GoalDetailResponse) => void;
}

export function GoalEditWizard({ open, goal, onClose, onUpdated }: GoalEditWizardProps) {
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<GoalReviewFieldErrors>({});
    const [hasValidationErrors, setHasValidationErrors] = useState(false);

    useEffect(() => {
        if (!open) {
            return;
        }

        setSaving(false);
        setError(null);
        setFieldErrors({});
        setHasValidationErrors(false);
    }, [open]);

    useEffect(() => {
        if (!open) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !saving) {
                onClose();
            }
        };

        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [open, onClose, saving]);

    const initialGoalData = useMemo(() => mapToUnderstandGoalResponse(goal), [goal]);

    if (!open) {
        return null;
    }

    function handleFieldEdited(fieldKey: GoalReviewFieldKey) {
        setFieldErrors((current) => {
            if (!current[fieldKey]) {
                return current;
            }

            const next = { ...current };
            delete next[fieldKey];
            return next;
        });

        setError(null);
    }

    async function handleConfirm(updatedData: UnderstandGoalResponse) {
        setSaving(true);
        setError(null);
        setFieldErrors({});

        try {
            const updated = await api.goals.updateGoal(goal.id, updatedData);
            onUpdated?.(updated);
            onClose();
        } catch (saveError) {
            if (saveError instanceof ApiError) {
                setFieldErrors(mapFieldErrorsToReviewErrors(saveError.fieldErrors ?? {}));
                setError(saveError.message);
            } else {
                setError("We could not save the changes right now. Please try again.");
            }
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="goal-wizard-backdrop">
            <div className="goal-wizard-page-theme-toggle">
                <ThemeToggle />
            </div>

            <section className="goal-wizard-shell" aria-labelledby="goal-edit-wizard-title">
                <div className="goal-wizard-main">
                    <header className="goal-wizard-header">
                        <div className="goal-wizard-header-main">
                            <button
                                type="button"
                                className="btn btn-ghost btn-icon goal-wizard-close"
                                onClick={onClose}
                                aria-label="Close goal editor"
                                disabled={saving}
                            >
                                <X size={30} />
                            </button>
                            <div className="goal-wizard-header-copy">
                                <h3 id="goal-edit-wizard-title">Reshape Your Goal</h3>
                                <p>Make changes to your goal details and save when you&apos;re done.</p>
                            </div>
                        </div>
                    </header>

                    <GoalWizardReview
                        goalData={initialGoalData}
                        saving={saving}
                        error={error}
                        fieldErrors={fieldErrors}
                        hideBack
                        onBack={onClose}
                        onFieldEdited={handleFieldEdited}
                        onValidationStateChange={setHasValidationErrors}
                        onConfirm={(data) => void handleConfirm(data)}
                    />
                </div>

                <GoalWizardVisual
                    mode={hasValidationErrors ? "thinking" : "gotIt"}
                    boyStepIndex={0}
                    isBoyVisible={true}
                />
            </section>
        </div>
    );
}
