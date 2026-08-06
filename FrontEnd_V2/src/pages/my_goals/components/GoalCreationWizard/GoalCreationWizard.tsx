import { useEffect, useRef, useState } from "react";
import {
    ClockHistory,
    X,
} from "react-bootstrap-icons";

import { api } from "@/api";
import { ApiError } from "@/api/client";
import type { UnderstandGoalRequest } from "@/api/types";

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

type WizardPhase = "questions" | "understanding" | "review";

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
    
    const [answers, setAnswers] = useState<Record<GoalWizardStepKey, string>>(EMPTY_ANSWERS);
    const [submitting, setSubmitting] = useState(false);
    const [savingGoal, setSavingGoal] = useState(false);
    const [loaderIndex, setLoaderIndex] = useState(0);
    const [error, setError] = useState<string | null>(null);
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
    }

    function goNextFrom(stepIndex: number) {
        setError(null);
        setCurrentStepIndex(Math.min(stepIndex + 1, STEPS.length - 1));
    }

    async function handleSubmit() {
        const payload: UnderstandGoalRequest = {
            goal: answers.goal.trim(),
            why: answers.why.trim(),
            success: answers.success.trim(),
            reality: answers.reality.trim(),
            obstacles: answers.obstacles.trim(),
        };

        setPhase("understanding");
        setSubmitting(true);
        setLoaderIndex(0);
        setError(null);

        try {
            const response = await api.goals.understandGoal(payload);
            setUnderstoodGoal(response);
            setPhase("review");
            setSubmitting(false);
        } catch (submissionError) {
            if (submissionError instanceof ApiError) {
                setError(submissionError.message);
            } else {
                setError("We could not understand the goal right now. Please try again.");
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
                            error={error}
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

                <GoalWizardVisual boyStepIndex={boyStepIndex} isBoyVisible={isBoyVisible} />
            </section>
        </div>
    );
}
