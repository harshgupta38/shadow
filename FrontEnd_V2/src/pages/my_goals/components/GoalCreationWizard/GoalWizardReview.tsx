import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Plus, Trash3 } from "react-bootstrap-icons";

import type {
    GoalCategory,
    UnderstandGoalResponse,
} from "@/api/types";

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

type ListFieldKey = "challenges" | "strengths" | "success_metrics" | "insights";

const LIST_FIELD_CONFIG: Array<{ key: ListFieldKey; label: string }> = [
    { key: "challenges", label: "Challenges" },
    { key: "strengths", label: "Strengths" },
    { key: "success_metrics", label: "Success Metrics" },
    { key: "insights", label: "Insights" },
];

interface GoalWizardReviewProps {
    goalData: UnderstandGoalResponse;
    saving: boolean;
    error: string | null;
    onBack: () => void;
    onConfirm: (goalData: UnderstandGoalResponse) => void;
}

export function GoalWizardReview({ goalData, saving, error, onBack, onConfirm }: GoalWizardReviewProps) {
    const [editableGoal, setEditableGoal] = useState<UnderstandGoalResponse>(goalData);
    const [activeListTab, setActiveListTab] = useState<ListFieldKey>("challenges");
    const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

    useEffect(() => {
        setEditableGoal(goalData);
        setActiveListTab("challenges");
    }, [goalData]);

    useEffect(() => {
        Object.values(textareaRefs.current).forEach((textarea) => {
            if (textarea) {
                resizeTextarea(textarea);
            }
        });
    }, [editableGoal]);

    function resizeTextarea(textarea: HTMLTextAreaElement) {
        const computedStyle = window.getComputedStyle(textarea);
        const lineHeight = Number.parseFloat(computedStyle.lineHeight) || 24;
        const verticalPadding = Number.parseFloat(computedStyle.paddingTop) + Number.parseFloat(computedStyle.paddingBottom);
        const verticalBorder = Number.parseFloat(computedStyle.borderTopWidth) + Number.parseFloat(computedStyle.borderBottomWidth);
        const maxHeight = (lineHeight * MAX_TEXTAREA_LINES) + verticalPadding + verticalBorder;

        textarea.style.height = "auto";
        const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
        textarea.style.height = `${nextHeight}px`;
        textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
    }

    function registerTextareaRef(key: string) {
        return (textarea: HTMLTextAreaElement | null) => {
            textareaRefs.current[key] = textarea;

            if (textarea) {
                resizeTextarea(textarea);
            }
        };
    }

    function updateField<K extends keyof UnderstandGoalResponse>(key: K, value: UnderstandGoalResponse[K]) {
        setEditableGoal((current) => ({
            ...current,
            [key]: value,
        }));
    }

    function updateListField(key: ListFieldKey, index: number, value: string) {
        setEditableGoal((current) => ({
            ...current,
            [key]: current[key].map((item, itemIndex) => (itemIndex === index ? value : item)),
        }));
    }

    function addListFieldItem(key: ListFieldKey) {
        setEditableGoal((current) => ({
            ...current,
            [key]: [...current[key], ""],
        }));
    }

    function removeListFieldItem(key: ListFieldKey, index: number) {
        setEditableGoal((current) => {
            const nextItems = current[key].filter((_, itemIndex) => itemIndex !== index);

            return {
                ...current,
                [key]: nextItems.length > 0 ? nextItems : [""],
            };
        });
    }

    function handleSave() {
        const payload: UnderstandGoalResponse = {
            ...editableGoal,
            challenges: editableGoal.challenges.map((item) => item.trim()).filter((item) => item.length > 0),
            strengths: editableGoal.strengths.map((item) => item.trim()).filter((item) => item.length > 0),
            success_metrics: editableGoal.success_metrics.map((item) => item.trim()).filter((item) => item.length > 0),
            insights: editableGoal.insights.map((item) => item.trim()).filter((item) => item.length > 0),
        };

        onConfirm(payload);
    }

    const activeListConfig = LIST_FIELD_CONFIG.find(({ key }) => key === activeListTab) ?? LIST_FIELD_CONFIG[0];
    const activeListItems = editableGoal[activeListConfig.key];

    return (
        <div className="goal-wizard-body">
            <div className="goal-wizard-review" aria-live="polite">
                <div className="goal-wizard-review-form">
                    <div>
                        <label className="form-label">Title</label>
                        <input
                            className="form-control"
                            value={editableGoal.title}
                            onChange={(event) => updateField("title", event.target.value)}
                            disabled={saving}
                        />
                    </div>

                    <div>
                        <label className="form-label">Summary</label>
                        <textarea
                            className="form-control"
                            rows={3}
                            value={editableGoal.summary}
                            onChange={(event) => {
                                updateField("summary", event.target.value);
                                resizeTextarea(event.currentTarget);
                            }}
                            ref={registerTextareaRef("summary")}
                            disabled={saving}
                        />
                    </div>

                    <div className="goal-wizard-review-grid-target-date">
                        <div>
                            <label className="form-label">Target Date</label>
                            <input
                                type="date"
                                className="form-control"
                                value={editableGoal.target_date}
                                onChange={(event) => updateField("target_date", event.target.value)}
                                disabled={saving}
                            />
                        </div>
                        <div>
                            <label className="form-label">Category</label>
                            <select
                                className="form-select"
                                value={editableGoal.category}
                                onChange={(event) => updateField("category", event.target.value as GoalCategory)}
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
                            className="form-control"
                            rows={2}
                            value={editableGoal.motivation}
                            onChange={(event) => {
                                updateField("motivation", event.target.value);
                                resizeTextarea(event.currentTarget);
                            }}
                            ref={registerTextareaRef("motivation")}
                            disabled={saving}
                        />
                    </div>

                    <div>
                        <label className="form-label">Success Definition</label>
                        <textarea
                            className="form-control"
                            rows={2}
                            value={editableGoal.success_definition}
                            onChange={(event) => {
                                updateField("success_definition", event.target.value);
                                resizeTextarea(event.currentTarget);
                            }}
                            ref={registerTextareaRef("success_definition")}
                            disabled={saving}
                        />
                    </div>

                    <div>
                        <label className="form-label">Current State</label>
                        <textarea
                            className="form-control"
                            rows={2}
                            value={editableGoal.current_state}
                            onChange={(event) => {
                                updateField("current_state", event.target.value);
                                resizeTextarea(event.currentTarget);
                            }}
                            ref={registerTextareaRef("current_state")}
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
                                        className={`goal-wizard-review-tab ${activeListTab === key ? "is-active" : ""}`.trim()}
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
                            className="goal-wizard-review-tab-panel"
                            aria-labelledby={`goal-wizard-review-tab-${activeListConfig.key}`}
                        >
                            <label className="form-label">{activeListConfig.label}</label>
                            <div className="goal-wizard-review-list">
                                {activeListItems.map((item, index) => (
                                    <div key={`${activeListConfig.key}-${index}`} className="goal-wizard-review-list-item">
                                        <textarea
                                            className="form-control goal-wizard-review-list-textarea"
                                            rows={1}
                                            value={item}
                                            onChange={(event) => {
                                                updateListField(activeListConfig.key, index, event.target.value);
                                                resizeTextarea(event.currentTarget);
                                            }}
                                            ref={registerTextareaRef(`${activeListConfig.key}-${index}`)}
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
                    <button type="button" className="btn btn-soft" onClick={onBack} disabled={saving}>
                        <ChevronLeft size={16} className="me-1" /> Edit Answers
                    </button>
                    <button type="button" className="btn btn-brand" onClick={handleSave} disabled={saving}>
                        {saving ? "Saving Goal..." : "Save Goal"}
                    </button>
                    {error && <div className="alert alert-danger py-2 px-3 small mb-0">{error}</div>}
                </div>

            </div>
        </div>
    );
}