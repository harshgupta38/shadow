import { useEffect, useRef, useState } from "react";
import {
    X,
} from "react-bootstrap-icons";

import { api } from "@/api";
import { ApiError } from "@/api/client";
import type { UnderstandGoalRequest, UnderstandGoalResponse } from "@/api/types";
import { ThemeToggle } from "@/components/ui/ThemeToggle/ThemeToggle";
import { resizeTextareaToMaxLines } from "@/services/textarea-resize.service";

import {
    EMPTY_ANSWERS,
    LOADER_STEPS,
    STEPS,
    type GoalWizardStepKey,
} from "@/pages/my_goals/GoalCreationWizard/GoalWizard.constants";
import { GoalWizardReview } from "@/pages/my_goals/GoalCreationWizard/GoalWizardReview";
import { GoalWizardVisual } from "@/pages/my_goals/GoalCreationWizard/GoalWizardVisual";
import { GoalWizardStepper } from "@/pages/my_goals/GoalCreationWizard/GoalWizardStepper";

import "@/pages/my_goals/GoalCreationWizard/GoalCreationWizard.scss";

// Visual animation tuning values for the right-side boy movement.
const BOY_MULTI_STEP_INTERVAL_MS = 260;
const BOY_BACKWARD_FADE_MS = 200;
const ORDERED_STEP_KEYS = STEPS.map((step) => step.key);

type WizardPhase = "questions" | "understanding" | "review";
type GoalWizardAnswers = Record<GoalWizardStepKey, string>;
type GoalWizardStepErrors = Partial<Record<GoalWizardStepKey, string>>;
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

const PHASE_TITLES: Record<WizardPhase, string[]> = {
    questions: ["Build Your Goal"],
    understanding: ["Analyzing Your Goal", "We're turning your answers into a structured brief step by step."],
    review: ["Review Your Goal", "Your coach has organized your ideas into a structured goal. Review it, make any changes if needed, and save it."],
};

function getNextStepValidationError(answers: GoalWizardAnswers, stepKey: GoalWizardStepKey): string | null {
    return answers[stepKey].trim() ? null : "Please provide your answer before continuing.";
}

function validateSubmitAnswers(
    answers: GoalWizardAnswers,
    orderedStepKeys: GoalWizardStepKey[],
): { stepErrors: GoalWizardStepErrors; firstMissingStepKey: GoalWizardStepKey | null } {
    const stepErrors: GoalWizardStepErrors = {};

    for (const stepKey of orderedStepKeys) {
        if (!answers[stepKey].trim()) {
            stepErrors[stepKey] = "Please complete this section before shaping your goal.";
        }
    }

    const firstMissingStepKey = orderedStepKeys.find((stepKey) => stepErrors[stepKey]) ?? null;

    return {
        stepErrors,
        firstMissingStepKey,
    };
}

function buildUnderstandGoalPayload(answers: GoalWizardAnswers): UnderstandGoalRequest {
    return {
        goal: answers.goal.trim(),
        why: answers.why.trim(),
        success: answers.success.trim(),
        reality: answers.reality.trim(),
        obstacles: answers.obstacles.trim(),
    };
}

function findFirstFieldErrorStepKey(
    fieldErrors: Partial<Record<string, string>>,
    orderedStepKeys: GoalWizardStepKey[],
): GoalWizardStepKey | null {
    return (
        orderedStepKeys.find((stepKey) => {
            const fieldMessage = fieldErrors[stepKey];
            return typeof fieldMessage === "string" && fieldMessage.trim().length > 0;
        }) ?? null
    );
}

function mapFieldErrorsToStepErrors(
    fieldErrors: Partial<Record<string, string>>,
    orderedStepKeys: GoalWizardStepKey[],
): GoalWizardStepErrors {
    const stepErrors: GoalWizardStepErrors = {};

    for (const stepKey of orderedStepKeys) {
        const fieldMessage = fieldErrors[stepKey];
        if (typeof fieldMessage === "string" && fieldMessage.trim().length > 0) {
            stepErrors[stepKey] = fieldMessage;
        }
    }

    return stepErrors;
}

function mapFieldErrorsToReviewErrors(
    fieldErrors: Partial<Record<string, string>>,
): GoalReviewFieldErrors {
    const reviewFieldErrors: GoalReviewFieldErrors = {};

    for (const key of REVIEW_FIELD_KEYS) {
        const fieldMessage = fieldErrors[key];
        if (typeof fieldMessage === "string" && fieldMessage.trim().length > 0) {
            reviewFieldErrors[key] = fieldMessage;
        }
    }

    return reviewFieldErrors;
}

interface GoalCreationWizardProps {
    open: boolean;
    onClose: () => void;
    onSubmitted?: (response: UnderstandGoalResponse) => void | Promise<void>;
}

export function GoalCreationWizard({ open, onClose, onSubmitted }: GoalCreationWizardProps) {
    // Step and visual animation state.
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [boyStepIndex, setBoyStepIndex] = useState(0);
    const [isBoyVisible, setIsBoyVisible] = useState(true);
    const [phase, setPhase] = useState<WizardPhase>("questions");
    
    const [answers, setAnswers] = useState<GoalWizardAnswers>(EMPTY_ANSWERS);
    const [submitting, setSubmitting] = useState(false);
    const [savingGoal, setSavingGoal] = useState(false);
    const [loaderIndex, setLoaderIndex] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [stepErrors, setStepErrors] = useState<GoalWizardStepErrors>({});
    const [reviewFieldErrors, setReviewFieldErrors] = useState<GoalReviewFieldErrors>({});
    const [reviewHasValidationErrors, setReviewHasValidationErrors] = useState(false);
    const [understoodGoal, setUnderstoodGoal] = useState<UnderstandGoalResponse | null>(null);
    const boyStepTimerRef = useRef<number | null>(null);
    const boyFadeTimerRef = useRef<number | null>(null);
    const currentTitle = PHASE_TITLES[phase][0];
    const currentSubtitle = PHASE_TITLES[phase][1] ?? null;

    function clearBoyStepTimer() {
        if (boyStepTimerRef.current !== null) {
            window.clearInterval(boyStepTimerRef.current);
            boyStepTimerRef.current = null;
        }
    }

    function clearBoyFadeTimer() {
        if (boyFadeTimerRef.current !== null) {
            window.clearTimeout(boyFadeTimerRef.current);
            boyFadeTimerRef.current = null;
        }
    }

    // Reset wizard state whenever the full-screen flow opens.
    useEffect(() => {
        if (!open) {
            return;
        }

        setCurrentStepIndex(0);
        setBoyStepIndex(0);
        setIsBoyVisible(true);
        setPhase("questions");
        setAnswers(EMPTY_ANSWERS);
        setSubmitting(false);
        setSavingGoal(false);
        setLoaderIndex(0);
        setUnderstoodGoal(null);
        setError(null);
        setStepErrors({});
        setReviewFieldErrors({});
        setReviewHasValidationErrors(false);
    }, [open]);

    useEffect(() => {
        if (!open) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !submitting && !savingGoal) {
                onClose();
            }
        };

        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [open, onClose, submitting, savingGoal]);

    // Move the boy between step anchors.
    // Backward multi-step jumps use fade-out/fade-in; others animate across intermediate steps.
    useEffect(() => {
        if (!open) {
            clearBoyStepTimer();
            clearBoyFadeTimer();
            return;
        }

        clearBoyStepTimer();
        clearBoyFadeTimer();

        if (boyStepIndex === currentStepIndex) {
            setIsBoyVisible(true);
            return;
        }

        const distance = Math.abs(currentStepIndex - boyStepIndex);
        const isBackwardMultiStepJump = currentStepIndex < boyStepIndex && distance > 1;

        if (isBackwardMultiStepJump) {
            setIsBoyVisible(false);
            boyFadeTimerRef.current = window.setTimeout(() => {
                setBoyStepIndex(currentStepIndex);
                setIsBoyVisible(true);
                clearBoyFadeTimer();
            }, BOY_BACKWARD_FADE_MS);

            return () => {
                clearBoyFadeTimer();
            };
        }

        if (distance === 1) {
            setIsBoyVisible(true);
            setBoyStepIndex(currentStepIndex);
            return;
        }

        const direction = currentStepIndex > boyStepIndex ? 1 : -1;
        setIsBoyVisible(true);

        boyStepTimerRef.current = window.setInterval(() => {
            setBoyStepIndex((current) => {
                const next = current + direction;

                if (next === currentStepIndex) {
                    clearBoyStepTimer();
                }

                return next;
            });
        }, BOY_MULTI_STEP_INTERVAL_MS);

        return () => {
            clearBoyStepTimer();
            clearBoyFadeTimer();
        };
    }, [open, currentStepIndex]);

    // Progress copy in the simulated understanding loader.
    useEffect(() => {
        if (phase !== "understanding") {
            return;
        }

        const interval = window.setInterval(() => {
            setLoaderIndex((current) => Math.min(current + 1, LOADER_STEPS.length - 1));
        }, 1100);

        return () => {
            window.clearInterval(interval);
        };
    }, [phase]);

    const loaderMessage = LOADER_STEPS[Math.min(loaderIndex, LOADER_STEPS.length - 1)];

    useEffect(() => {
        if (!open) {
            return;
        }

        const activeStep = STEPS[currentStepIndex];
        const activeTextarea = document.getElementById(`goal-wizard-${activeStep.key}`);

        if (activeTextarea instanceof HTMLTextAreaElement) {
            resizeTextareaToMaxLines(activeTextarea);
        }
    }, [open, currentStepIndex]);

    if (!open) {
        return null;
    }

    function updateAnswer(stepKey: GoalWizardStepKey, value: string) {
        setAnswers((current) => ({
            ...current,
            [stepKey]: value,
        }));

        setStepErrors((current) => {
            if (!current[stepKey]) {
                return current;
            }

            const next = { ...current };
            delete next[stepKey];
            return next;
        });

        setError(null);
    }

    function goNextFrom(stepIndex: number) {
        const stepKey = STEPS[stepIndex].key;
        const validationError = getNextStepValidationError(answers, stepKey);

        if (validationError) {
            setStepErrors((current) => ({
                ...current,
                [stepKey]: validationError,
            }));
            setCurrentStepIndex(stepIndex);
            return;
        }

        setStepErrors((current) => {
            if (!current[stepKey]) {
                return current;
            }

            const next = { ...current };
            delete next[stepKey];
            return next;
        });

        setError(null);
        setCurrentStepIndex(Math.min(stepIndex + 1, STEPS.length - 1));
    }

    async function handleSubmit() {
        const { stepErrors: nextStepErrors, firstMissingStepKey } = validateSubmitAnswers(answers, ORDERED_STEP_KEYS);

        if (firstMissingStepKey) {
            setStepErrors(nextStepErrors);
            setError(null);

            const nextStepIndex = STEPS.findIndex((step) => step.key === firstMissingStepKey);
            if (nextStepIndex >= 0) {
                setCurrentStepIndex(nextStepIndex);
            }

            return;
        }

        const payload = buildUnderstandGoalPayload(answers);

        setPhase("understanding");
        setSubmitting(true);
        setLoaderIndex(0);
        setError(null);
        setStepErrors({});
        setReviewFieldErrors({});

        try {
            const response = await api.goals.understandGoal(payload);
            setUnderstoodGoal(response.refined_data);
            setPhase("review");
            setSubmitting(false);
        } catch (submissionError) {
            if (submissionError instanceof ApiError) {
                const fieldErrors = submissionError.fieldErrors ?? {};
                const missingField = findFirstFieldErrorStepKey(fieldErrors, ORDERED_STEP_KEYS);

                if (missingField) {
                    const nextStepErrors = mapFieldErrorsToStepErrors(fieldErrors, ORDERED_STEP_KEYS);

                    setStepErrors(nextStepErrors);
                    setError(null);

                    const nextStepIndex = STEPS.findIndex((step) => step.key === missingField);
                    if (nextStepIndex >= 0) {
                        setCurrentStepIndex(nextStepIndex);
                    }
                } else {
                    setStepErrors({});
                    setError(submissionError.message);
                }
            } else {
                setError("We could not understand the goal right now. Please try again.");
                setStepErrors({});
            }
            setPhase("questions");
            setSubmitting(false);
        }
    }

    async function handleConfirmGoal(goalToSave: UnderstandGoalResponse) {
        if (!goalToSave) {
            return;
        }

        setSavingGoal(true);
        setError(null);
        setReviewFieldErrors({});

        try {
            const savedGoal = await api.goals.saveGoal(goalToSave);
            await onSubmitted?.(savedGoal);
            onClose();
        } catch (saveError) {
            if (saveError instanceof ApiError) {
                const nextReviewFieldErrors = mapFieldErrorsToReviewErrors(saveError.fieldErrors ?? {});
                setReviewFieldErrors(nextReviewFieldErrors);
                setError(saveError.message);
            } else {
                setReviewFieldErrors({});
                setError("We could not save the goal right now. Please try again.");
            }
        } finally {
            setSavingGoal(false);
        }
    }

    function handleReviewFieldEdited(fieldKey: GoalReviewFieldKey) {
        setReviewFieldErrors((current) => {
            if (!current[fieldKey]) {
                return current;
            }

            const next = { ...current };
            delete next[fieldKey];
            return next;
        });

        setError(null);
    }

    return (
        <div className="goal-wizard-backdrop">
            <div className="goal-wizard-page-theme-toggle">
                <ThemeToggle />
            </div>

            <section className="goal-wizard-shell" aria-labelledby="goal-wizard-title">
                <div className="goal-wizard-main">
                    <header className="goal-wizard-header">
                        <div className="goal-wizard-header-main">
                            <button
                                type="button"
                                className="btn btn-ghost btn-icon goal-wizard-close"
                                onClick={onClose}
                                aria-label="Close goal setup"
                                disabled={submitting}
                            >
                                <X size={30} />
                            </button>
                            <div className="goal-wizard-header-copy">
                                <h3 id="goal-wizard-title">{currentTitle}</h3>
                                {currentSubtitle && <p>{currentSubtitle}</p>}
                            </div>
                        </div>
                    </header>

                    {phase === "questions" ? (
                        <GoalWizardStepper
                            currentStepIndex={currentStepIndex}
                            disabled={submitting || savingGoal}
                            answers={answers}
                            stepErrors={stepErrors}
                            fallbackError={error}
                            onSelectStep={setCurrentStepIndex}
                            onAnswerChange={(stepKey, value, textarea) => {
                                updateAnswer(stepKey, value);
                                resizeTextareaToMaxLines(textarea);
                            }}
                            onNextFrom={goNextFrom}
                            onSubmit={handleSubmit}
                        />
                    ) : null}

                    {phase === "understanding" ? (
                        <div className="goal-wizard-body">
                            <div className="goal-wizard-loader">
                                <div className="goal-wizard-loader-message">
                                    <span className="spinner-border spinner-border-sm" aria-hidden="true" />
                                    <span>{loaderMessage}</span>
                                </div>

                                <div className="goal-wizard-loader-track" aria-hidden="true">
                                    {LOADER_STEPS.map((loaderStep, loaderStepIndex) => (
                                        <span
                                            key={loaderStep}
                                            className={`goal-wizard-loader-dot ${loaderStepIndex <= loaderIndex ? "is-active" : ""}`.trim()}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : null}

                    {phase === "review" && understoodGoal !== null ? (
                        <GoalWizardReview
                            goalData={understoodGoal}
                            saving={savingGoal}
                            error={error}
                            fieldErrors={reviewFieldErrors}
                            onBack={() => {
                                setError(null);
                                setReviewFieldErrors({});
                                setPhase("questions");
                            }}
                            onFieldEdited={handleReviewFieldEdited}
                            onValidationStateChange={setReviewHasValidationErrors}
                            onConfirm={handleConfirmGoal}
                        />
                    ) : null}
                </div>

                <GoalWizardVisual
                    mode={phase === "understanding" ? "thinking" : phase === "review" ? (reviewHasValidationErrors ? "thinking" : "gotIt") : "journey"}
                    boyStepIndex={boyStepIndex}
                    isBoyVisible={isBoyVisible}
                />
            </section>
        </div>
    );
}
