import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Plus, Trash3 } from "react-bootstrap-icons";

import type {
    GoalCategory,
    RefineGoalFromLLMSchema,
} from "@/api/types";
import { resizeTextareaToMaxLines } from "@/services/textarea-resize.service";

const CATEGORY_OPTIONS: GoalCategory[] = [
    "Career",
    "Business",
    "Finance",
    "Health",
    "Fitness",
    "Education",
    "Relationships",
    "Productivity",
    "Personal Growth",
    "Travel",
    "Other",
];

const MAX_TEXTAREA_LINES = 8;
const MAX_LIST_TEXTAREA_LINES = 4;

type ListFieldKey = "challenges" | "strengths" | "success_metrics" | "insights";
type GoalReviewFieldKey = keyof RefineGoalFromLLMSchema;

const LIST_FIELD_CONFIG: Array<{ key: ListFieldKey; label: string }> = [
    { key: "challenges", label: "Challenges" },
    { key: "strengths", label: "Strengths" },
    { key: "success_metrics", label: "Success Metrics" },
    { key: "insights", label: "Insights" },
];

interface GoalWizardReviewProps {
    goalData: RefineGoalFromLLMSchema;
    saving: boolean;
    error: string | null;
    fieldErrors: Partial<Record<GoalReviewFieldKey, string>>;
    hideBack?: boolean;
    actionFrom?: "wizard" | "assistant";
    onBack: () => void;
    onFieldEdited: (fieldKey: GoalReviewFieldKey) => void;
    onValidationStateChange: (hasErrors: boolean) => void;
    onConfirm: (goalData: RefineGoalFromLLMSchema) => void;
}

function validateGoalReviewData(goalData: RefineGoalFromLLMSchema): Partial<Record<GoalReviewFieldKey, string>> {
    const errors: Partial<Record<GoalReviewFieldKey, string>> = {};

    const requiredTextFields: Array<{ key: GoalReviewFieldKey; label: string }> = [
        { key: "title", label: "Title" },
        { key: "summary", label: "Summary" },
        { key: "category", label: "Category" },
        { key: "motivation", label: "Motivation" },
        { key: "success_definition", label: "Success definition" },
        { key: "current_state", label: "Current state" },
        { key: "target_date", label: "Target date" },
    ];

    for (const { key, label } of requiredTextFields) {
        const value = goalData[key];
        if (typeof value !== "string" || value.trim().length === 0) {
            errors[key] = `${label} is required.`;
        }
    }

    const targetDateValue = goalData.target_date;
    if (typeof targetDateValue === "string" && targetDateValue.trim().length > 0) {
        const isIsoDate = /^\d{4}-\d{2}-\d{2}$/.test(targetDateValue.trim());

        if (!isIsoDate) {
            errors.target_date = "Target date must be in YYYY-MM-DD format.";
        } else {
            const parsedTargetDate = new Date(`${targetDateValue.trim()}T00:00:00`);
            const isValidDate = !Number.isNaN(parsedTargetDate.getTime());

            if (!isValidDate) {
                errors.target_date = "Target date must be in YYYY-MM-DD format.";
            } else {
                const today = new Date();
                const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                if (parsedTargetDate <= todayStart) {
                    errors.target_date = "Target date must be a future date.";
                }
            }
        }
    }

    const requiredListFields: Array<{ key: ListFieldKey; label: string }> = [
        { key: "challenges", label: "Challenges" },
        { key: "strengths", label: "Strengths" },
        { key: "success_metrics", label: "Success metrics" },
        { key: "insights", label: "Insights" },
    ];

    for (const { key, label } of requiredListFields) {
        const value = goalData[key];

        if (!Array.isArray(value) || value.length === 0) {
            errors[key] = `${label} must include at least one item.`;
            continue;
        }

        const hasNonEmptyString = value.some((item) => typeof item === "string" && item.trim().length > 0);
        if (!hasNonEmptyString) {
            errors[key] = `${label} must include at least one non-empty string.`;
        }
    }

    return errors;
}

function getFirstFieldErrorMessage(fieldErrors: Partial<Record<GoalReviewFieldKey, string>>): string | null {
    const orderedFieldKeys: GoalReviewFieldKey[] = [
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

    for (const key of orderedFieldKeys) {
        const message = fieldErrors[key];
        if (typeof message === "string" && message.trim().length > 0) {
            return message;
        }
    }

    return null;
}

export function GoalWizardReview({ goalData, saving, error, fieldErrors, hideBack, actionFrom, onBack, onFieldEdited, onValidationStateChange, onConfirm }: GoalWizardReviewProps) {
    const [editableGoal, setEditableGoal] = useState<RefineGoalFromLLMSchema>(goalData);
    const [activeListTab, setActiveListTab] = useState<ListFieldKey>("challenges");
    const [clientFieldErrors, setClientFieldErrors] = useState<Partial<Record<GoalReviewFieldKey, string>>>({});
    const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
    const textareaMaxLinesRefs = useRef<Record<string, number>>({});

    useEffect(() => {
        setEditableGoal(goalData);
        setActiveListTab("challenges");
    }, [goalData]);

    useEffect(() => {
        Object.entries(textareaRefs.current).forEach(([key, textarea]) => {
            if (textarea) {
                const maxLines = textareaMaxLinesRefs.current[key] ?? MAX_TEXTAREA_LINES;
                resizeTextareaToMaxLines(textarea, maxLines);
            }
        });
    }, [editableGoal]);

    useEffect(() => {
        const nextClientErrors = validateGoalReviewData(editableGoal);
        setClientFieldErrors(nextClientErrors);
        onValidationStateChange(Object.keys(nextClientErrors).length > 0);
    }, [editableGoal, onValidationStateChange]);

    function registerTextareaRef(key: string, maxLines: number = MAX_TEXTAREA_LINES) {
        return (textarea: HTMLTextAreaElement | null) => {
            textareaRefs.current[key] = textarea;
            textareaMaxLinesRefs.current[key] = maxLines;

            if (textarea) {
                resizeTextareaToMaxLines(textarea, maxLines);
            }
        };
    }

    function updateField<K extends keyof RefineGoalFromLLMSchema>(key: K, value: RefineGoalFromLLMSchema[K]) {
        setEditableGoal((current) => ({
            ...current,
            [key]: value,
        }));

        onFieldEdited(key);
    }

    function updateListField(key: ListFieldKey, index: number, value: string) {
        setEditableGoal((current) => ({
            ...current,
            [key]: current[key].map((item, itemIndex) => (itemIndex === index ? value : item)),
        }));

        onFieldEdited(key);
    }

    function addListFieldItem(key: ListFieldKey) {
        setEditableGoal((current) => ({
            ...current,
            [key]: [...current[key], ""],
        }));

        onFieldEdited(key);
    }

    function removeListFieldItem(key: ListFieldKey, index: number) {
        setEditableGoal((current) => {
            const nextItems = current[key].filter((_, itemIndex) => itemIndex !== index);

            return {
                ...current,
                [key]: nextItems.length > 0 ? nextItems : [""],
            };
        });

        onFieldEdited(key);
    }

    function handleSave() {
        const payload: RefineGoalFromLLMSchema = {
            ...editableGoal,
            challenges: editableGoal.challenges.map((item) => item.trim()).filter((item) => item.length > 0),
            strengths: editableGoal.strengths.map((item) => item.trim()).filter((item) => item.length > 0),
            success_metrics: editableGoal.success_metrics.map((item) => item.trim()).filter((item) => item.length > 0),
            insights: editableGoal.insights.map((item) => item.trim()).filter((item) => item.length > 0),
        };

        const nextClientErrors = validateGoalReviewData(payload);
        setClientFieldErrors(nextClientErrors);
        onValidationStateChange(Object.keys(nextClientErrors).length > 0);

        if (Object.keys(nextClientErrors).length > 0) {
            return;
        }

        onConfirm(payload);
    }

    const activeListConfig = LIST_FIELD_CONFIG.find(({ key }) => key === activeListTab) ?? LIST_FIELD_CONFIG[0];
    const activeListItems = editableGoal[activeListConfig.key];
    const effectiveFieldErrors: Partial<Record<GoalReviewFieldKey, string>> = {
        ...clientFieldErrors,
        ...fieldErrors,
    };
    const validationErrorMessage = getFirstFieldErrorMessage(effectiveFieldErrors);
    const footerErrorMessage = validationErrorMessage ?? error;

    function getFieldErrorTitle(fieldKey: GoalReviewFieldKey): string | undefined {
        const message = effectiveFieldErrors[fieldKey];
        return typeof message === "string" && message.trim().length > 0 ? message : undefined;
    }

    return (
        <div className={`goal-wizard-body ${actionFrom === "assistant" ? "less-padding" : ""}`.trim()}>
            <div className="goal-wizard-review pb-2" aria-live="polite">
                <div className="goal-wizard-review-form">
                    <div>
                        <label className="form-label">Title</label>
                        <input
                            className={`form-control ${effectiveFieldErrors.title ? "is-invalid" : ""}`.trim()}
                            value={editableGoal.title}
                            onChange={(event) => updateField("title", event.target.value)}
                            title={getFieldErrorTitle("title")}
                            disabled={saving}
                        />
                    </div>

                    <div>
                        <label className="form-label">Summary</label>
                        <textarea
                            className={`form-control ${effectiveFieldErrors.summary ? "is-invalid" : ""}`.trim()}
                            rows={3}
                            value={editableGoal.summary}
                            onChange={(event) => {
                                updateField("summary", event.target.value);
                                resizeTextareaToMaxLines(event.currentTarget);
                            }}
                            ref={registerTextareaRef("summary")}
                            title={getFieldErrorTitle("summary")}
                            disabled={saving}
                        />
                    </div>

                    <div className="goal-wizard-review-grid-target-date">
                        <div>
                            <label className="form-label">Target Date</label>
                            <input
                                type="date"
                                className={`form-control ${effectiveFieldErrors.target_date ? "is-invalid" : ""}`.trim()}
                                value={editableGoal.target_date}
                                onChange={(event) => updateField("target_date", event.target.value)}
                                title={getFieldErrorTitle("target_date")}
                                disabled={saving}
                            />
                        </div>
                        <div>
                            <label className="form-label">Category</label>
                            <select
                                className={`form-select ${effectiveFieldErrors.category ? "is-invalid" : ""}`.trim()}
                                value={editableGoal.category}
                                onChange={(event) => updateField("category", event.target.value as GoalCategory)}
                                title={getFieldErrorTitle("category")}
                                disabled={saving}
                            >
                                {CATEGORY_OPTIONS.map((category) => (
                                    <option key={category} value={category}>
                                        {category}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="form-label">Motivation</label>
                        <textarea
                            className={`form-control ${effectiveFieldErrors.motivation ? "is-invalid" : ""}`.trim()}
                            rows={2}
                            value={editableGoal.motivation}
                            onChange={(event) => {
                                updateField("motivation", event.target.value);
                                resizeTextareaToMaxLines(event.currentTarget);
                            }}
                            ref={registerTextareaRef("motivation")}
                            title={getFieldErrorTitle("motivation")}
                            disabled={saving}
                        />
                    </div>

                    <div>
                        <label className="form-label">Success Definition</label>
                        <textarea
                            className={`form-control ${effectiveFieldErrors.success_definition ? "is-invalid" : ""}`.trim()}
                            rows={2}
                            value={editableGoal.success_definition}
                            onChange={(event) => {
                                updateField("success_definition", event.target.value);
                                resizeTextareaToMaxLines(event.currentTarget);
                            }}
                            ref={registerTextareaRef("success_definition")}
                            title={getFieldErrorTitle("success_definition")}
                            disabled={saving}
                        />
                    </div>

                    <div>
                        <label className="form-label">Current State</label>
                        <textarea
                            className={`form-control ${effectiveFieldErrors.current_state ? "is-invalid" : ""}`.trim()}
                            rows={2}
                            value={editableGoal.current_state}
                            onChange={(event) => {
                                updateField("current_state", event.target.value);
                                resizeTextareaToMaxLines(event.currentTarget);
                            }}
                            ref={registerTextareaRef("current_state")}
                            title={getFieldErrorTitle("current_state")}
                            disabled={saving}
                        />
                    </div>

                    <div className="goal-wizard-review-tabbed-list">
                        <div className="goal-wizard-review-tabs" role="tablist" aria-label="Goal detail lists">
                            {LIST_FIELD_CONFIG.map(({ key, label }) => {
                                const itemCount = editableGoal[key].filter((item) => item.trim().length > 0).length;

                                return (
                                    <button
                                        key={key}
                                        id={`goal-wizard-review-tab-${key}`}
                                        type="button"
                                        role="tab"
                                        className={`goal-wizard-review-tab ${activeListTab === key ? "is-active" : ""} ${effectiveFieldErrors[key] ? "is-error" : ""}`.trim()}
                                        aria-selected={activeListTab === key}
                                        aria-controls={`goal-wizard-review-panel-${key}`}
                                        onClick={() => setActiveListTab(key)}
                                        disabled={saving}
                                    >
                                        <span>{label}</span>
                                        <span className="goal-wizard-review-tab-count">{itemCount}</span>
                                    </button>
                                );
                            })}
                        </div>

                        <div
                            id={`goal-wizard-review-panel-${activeListConfig.key}`}
                            role="tabpanel"
                            className={`goal-wizard-review-tab-panel ${effectiveFieldErrors[activeListConfig.key] ? "has-error" : ""}`.trim()}
                            aria-labelledby={`goal-wizard-review-tab-${activeListConfig.key}`}
                        >
                            <div className="goal-wizard-review-list">
                                {activeListItems.map((item, index) => (
                                    <div key={`${activeListConfig.key}-${index}`} className="goal-wizard-review-list-item">
                                        <textarea
                                            className={`form-control goal-wizard-review-list-textarea ${effectiveFieldErrors[activeListConfig.key] ? "is-invalid" : ""}`.trim()}
                                            rows={1}
                                            value={item}
                                            onChange={(event) => {
                                                updateListField(activeListConfig.key, index, event.target.value);
                                                resizeTextareaToMaxLines(event.currentTarget, MAX_LIST_TEXTAREA_LINES);
                                            }}
                                            ref={registerTextareaRef(`${activeListConfig.key}-${index}`, MAX_LIST_TEXTAREA_LINES)}
                                            title={getFieldErrorTitle(activeListConfig.key)}
                                            disabled={saving}
                                        />
                                        <button
                                            type="button"
                                            className="btn btn-soft goal-wizard-review-list-remove"
                                            onClick={() => removeListFieldItem(activeListConfig.key, index)}
                                            disabled={saving}
                                            aria-label={`Remove ${activeListConfig.label} item ${index + 1}`}
                                        >
                                            <Trash3 size={14} />
                                        </button>
                                    </div>
                                ))}
                                <button
                                    type="button"
                                    className="btn btn-soft goal-wizard-review-list-add"
                                    onClick={() => addListFieldItem(activeListConfig.key)}
                                    disabled={saving}
                                >
                                    <Plus size={14} className="me-1" /> Add {activeListConfig.label}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="goal-wizard-footer">
                    {!hideBack && (
                        <button type="button" className="btn btn-soft" onClick={onBack} disabled={saving}>
                            <ChevronLeft size={16} className="me-1" /> Edit Answers
                        </button>
                    )}
                    <button type="button" className="btn btn-brand" onClick={handleSave} disabled={saving}>
                        {saving ? "Saving..." : "Save"}
                    </button>
                    {actionFrom === "assistant" && (
                        <button type="button" className="btn btn-soft" onClick={onBack} disabled={saving}>
                            Cancel
                        </button>
                    )}
                    {footerErrorMessage && <div className="alert alert-danger py-2 px-3 small mb-0">{footerErrorMessage}</div>}
                </div>

            </div>
        </div>
    );
}