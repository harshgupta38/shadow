import { useEffect, useState } from "react";
import { ChevronRight } from "react-bootstrap-icons";

import { api } from "@/api";
import { ApiError } from "@/api/client";
import type { GoalDataResponse, GoalProposal, RefineGoalFromLLMSchema } from "@/api/types";
import { GoalWizardReview } from "@/pages/my_goals/GoalCreationWizard/GoalWizardReview";

import "@/pages/my_goals/GoalCreationWizard/GoalCreationWizard.scss";
import "@/pages/assistant/RefinedGoalReviewPanel/RefinedGoalReviewPanel.scss";

type GoalReviewFieldKey = keyof RefineGoalFromLLMSchema;
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

interface RefinedGoalReviewPanelProps {
    proposal: GoalProposal;
    onClose: () => void;
    onSaved?: (goal: GoalDataResponse) => void | Promise<void>;
}

const SLIDE_OUT_DURATION_MS = 220;

export function RefinedGoalReviewPanel({ proposal, onClose, onSaved }: RefinedGoalReviewPanelProps) {
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<GoalReviewFieldErrors>({});
    const [isClosing, setIsClosing] = useState(false);

    function requestClose() {
        if (isClosing) return;
        setIsClosing(true);
        window.setTimeout(onClose, SLIDE_OUT_DURATION_MS);
    }

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !saving) {
                requestClose();
            }
        };

        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.removeEventListener("keydown", handleKeyDown);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [saving, isClosing]);

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

    async function handleConfirm(refinedGoal: RefineGoalFromLLMSchema) {
        setSaving(true);
        setError(null);
        setFieldErrors({});

        try {
            const goal = await api.goals.saveGoalFromProposal({
                proposal_id: proposal.proposal_id,
                goal: refinedGoal,
            });
            await onSaved?.(goal);
            requestClose();
        } catch (saveError) {
            if (saveError instanceof ApiError) {
                setFieldErrors(mapFieldErrorsToReviewErrors(saveError.fieldErrors ?? {}));
                setError(saveError.message);
            } else {
                setError("We could not save the goal right now. Please try again.");
            }
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="goal-refined-review-backdrop">
            <section className={`goal-refined-review-panel${isClosing ? " is-closing" : ""}`} aria-labelledby="goal-refined-review-title">
                <header className="goal-wizard-header">
                    <div className="goal-wizard-header-main">
                        <div className="goal-wizard-header-copy">
                            <h3 id="goal-refined-review-title" className="d-flex align-items-center justify-content-between">
                                Review Your Goal
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-icon goal-wizard-close"
                                    onClick={requestClose}
                                    aria-label="Close goal review"
                                    disabled={saving}
                                >
                                    <ChevronRight size={25} />
                                </button>
                            </h3>
                            <p>Your coach has organized your ideas into a structured goal. Review it, make any changes if needed, and save it.</p>
                        </div>
                    </div>
                </header>

                <GoalWizardReview
                    goalData={proposal.goal}
                    saving={saving}
                    error={error}
                    fieldErrors={fieldErrors}
                    hideBack
                    actionFrom="assistant"
                    onBack={requestClose}
                    onFieldEdited={handleFieldEdited}
                    onValidationStateChange={() => { }}
                    onConfirm={(data) => void handleConfirm(data)}
                />
            </section>
        </div>
    );
}
