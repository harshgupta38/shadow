import { useEffect, useRef, useState } from "react";
import {
    ClockHistory,
    X,
} from "react-bootstrap-icons";

import { api } from "@/api";
import { ApiError } from "@/api/client";
import type { UnderstandGoalRequest } from "@/api/types";
import { ThemeToggle } from "@/components/ui/ThemeToggle/ThemeToggle";

import {
    EMPTY_ANSWERS,
    LOADER_STEPS,
    STEPS,
    type GoalWizardStepKey,
} from "./GoalWizard.constants";
import { GoalWizardReview } from "./GoalWizardReview";
import { GoalWizardVisual } from "./GoalWizardVisual";
import { GoalWizardStepper } from "./GoalWizardStepper";

import "./GoalCreationWizard.scss";

// Visual animation tuning values for the right-side boy movement.
const MAX_ANSWER_LINES = 8;
const BOY_MULTI_STEP_INTERVAL_MS = 260;
const BOY_BACKWARD_FADE_MS = 200;
const ORDERED_STEP_KEYS = STEPS.map((step) => step.key);

type WizardPhase = "questions" | "understanding" | "review";
type GoalWizardAnswers = Record<GoalWizardStepKey, string>;
type GoalWizardStepErrors = Partial<Record<GoalWizardStepKey, string>>;

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

interface GoalCreationWizardProps {
    open: boolean;
    onClose: () => void;
    onSubmitted?: (response: unknown) => void | Promise<void>;
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
    const [understoodGoal, setUnderstoodGoal] = useState<unknown>(null);
    const boyStepTimerRef = useRef<number | null>(null);
    const boyFadeTimerRef = useRef<number | null>(null);

    const goalPreview = answers.goal.trim() || "Your goal summary will appear here.";
    const whyPreview = answers.why.trim() || "Your motivation summary will appear here.";
    const successPreview = answers.success.trim() || "Your success criteria summary will appear here.";

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

    // Auto-grow textarea up to MAX_ANSWER_LINES, then enable vertical scroll.
    function resizeAnswerTextarea(textarea: HTMLTextAreaElement) {
        const computedStyle = window.getComputedStyle(textarea);
        const lineHeight = Number.parseFloat(computedStyle.lineHeight) || 24;
        const verticalPadding = Number.parseFloat(computedStyle.paddingTop) + Number.parseFloat(computedStyle.paddingBottom);
        const verticalBorder = Number.parseFloat(computedStyle.borderTopWidth) + Number.parseFloat(computedStyle.borderBottomWidth);
        const maxHeight = (lineHeight * MAX_ANSWER_LINES) + verticalPadding + verticalBorder;

        textarea.style.height = "auto";
        const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
        textarea.style.height = `${nextHeight}px`;
        textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
    }

    useEffect(() => {
        if (!open) {
            return;
        }

        const activeStep = STEPS[currentStepIndex];
        const activeTextarea = document.getElementById(`goal-wizard-${activeStep.key}`);

        if (activeTextarea instanceof HTMLTextAreaElement) {
            resizeAnswerTextarea(activeTextarea);
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

        try {
            const response = await api.goals.understandGoal(payload);
            setUnderstoodGoal(response);
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

    async function handleConfirmGoal() {
        if (understoodGoal === null) {
            return;
        }

        setSavingGoal(true);
        setError(null);

        try {
            await onSubmitted?.(understoodGoal);
            onClose();
        } catch (saveError) {
            if (saveError instanceof ApiError) {
                setError(saveError.message);
            } else {
                setError("We could not save the goal right now. Please try again.");
            }
        } finally {
            setSavingGoal(false);
        }
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
                            <h3 id="goal-wizard-title">Build Your Goal</h3>
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
                                resizeAnswerTextarea(textarea);
                            }}
                            onNextFrom={goNextFrom}
                            onSubmit={handleSubmit}
                        />
                    ) : null}

                    {phase === "understanding" ? (
                        <div className="goal-wizard-body">
                            <div className="goal-wizard-loader">
                                <div className="goal-wizard-loader-head">
                                    <div className="goal-wizard-loader-badge">
                                        <ClockHistory size={16} />
                                    </div>
                                    <div>
                                        <h3>Understanding your goal</h3>
                                        <p>We're turning your answers into a structured brief step by step.</p>
                                    </div>
                                </div>

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

                                <div className="goal-wizard-loader-card">
                                    <div className="goal-wizard-loader-card-title">Working with your answers</div>
                                    <ul>
                                        <li>{goalPreview}</li>
                                        <li>{whyPreview}</li>
                                        <li>{successPreview}</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    ) : null}

                    {phase === "review" && understoodGoal !== null ? (
                        <GoalWizardReview
                            goalData={understoodGoal}
                            saving={savingGoal}
                            error={error}
                            onBack={() => {
                                setError(null);
                                setPhase("questions");
                            }}
                            onConfirm={handleConfirmGoal}
                        />
                    ) : null}
                </div>

                <GoalWizardVisual
                    mode={phase === "understanding" ? "thinking" : phase === "review" ? "gotIt" : "journey"}
                    boyStepIndex={boyStepIndex}
                    isBoyVisible={isBoyVisible}
                />
            </section>
        </div>
    );
}
