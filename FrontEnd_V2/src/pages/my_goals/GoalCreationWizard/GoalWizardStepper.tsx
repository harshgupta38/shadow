import {
    ArrowRight,
    Stars,
} from "react-bootstrap-icons";

import { STEPS, type GoalWizardStepKey } from "./GoalWizard.constants";

interface GoalWizardStepperProps {
    currentStepIndex: number;
    disabled: boolean;
    answers: Record<GoalWizardStepKey, string>;
    stepErrors: Partial<Record<GoalWizardStepKey, string>>;
    fallbackError: string | null;
    onSelectStep: (index: number) => void;
    onAnswerChange: (stepKey: GoalWizardStepKey, value: string, textarea: HTMLTextAreaElement) => void;
    onNextFrom: (index: number) => void;
    onSubmit: () => void;
}

export function GoalWizardStepper({
    currentStepIndex,
    disabled,
    answers,
    stepErrors,
    fallbackError,
    onSelectStep,
    onAnswerChange,
    onNextFrom,
    onSubmit,
}: GoalWizardStepperProps) {
    return (
        <div className="goal-wizard-body">
            <aside className="goal-wizard-stepper" aria-label="Goal setup steps">
                {STEPS.map((step, index) => {
                    const isActive = index === currentStepIndex;
                    const isDone = index < currentStepIndex;
                    const hasInput = answers[step.key].trim().length > 0;
                    const ctaError = stepErrors[step.key] ?? (isActive ? fallbackError : null);

                    return (
                        <div
                            key={step.key}
                            className={`goal-wizard-step-block ${isActive ? "is-active" : ""} ${isDone ? "is-done" : ""}`.trim()}
                        >
                            <button
                                type="button"
                                className={`goal-wizard-step ${isActive ? "is-active" : ""} ${isDone ? "is-done" : ""}`.trim()}
                                onClick={() => onSelectStep(index)}
                                disabled={disabled}
                            >
                                <span className="goal-wizard-step-index">{isDone && !isActive ? "✓" : index + 1}</span>
                                <span className="goal-wizard-step-copy">
                                    <span className="goal-wizard-step-title">{step.title}</span>
                                </span>
                            </button>

                            <div className="goal-wizard-step-expand" aria-hidden={!isActive}>
                                <div className="goal-wizard-step-expand-inner">
                                    <div className="goal-wizard-stage-header">
                                        <h3>{step.question}</h3>
                                        <p>{step.helper}</p>
                                    </div>

                                    <textarea
                                        id={`goal-wizard-${step.key}`}
                                        className="form-control goal-wizard-answer"
                                        placeholder={step.placeholder}
                                        value={answers[step.key]}
                                        onChange={(event) => onAnswerChange(step.key, event.target.value, event.currentTarget)}
                                        disabled={!isActive || disabled}
                                    />

                                    <div className="goal-wizard-footer mt-3">
                                        {index < STEPS.length - 1 ? (
                                            <button type="button" className="btn btn-brand btn-brand-custom" onClick={() => onNextFrom(index)} disabled={!isActive || disabled || !hasInput}>
                                                Next <ArrowRight size={16} className="ms-1" />
                                            </button>
                                        ) : (
                                            <button type="button" className="btn btn-brand btn-brand-custom" onClick={onSubmit} disabled={!isActive || disabled || !hasInput}>
                                                Shape My Goal <Stars size={16} className="ms-1" />
                                            </button>
                                        )}
                                        
                                        {ctaError ? <div className="alert alert-danger goal-wizard-inline-error mb-0">{ctaError}</div> : null}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </aside>
        </div>
    );
}