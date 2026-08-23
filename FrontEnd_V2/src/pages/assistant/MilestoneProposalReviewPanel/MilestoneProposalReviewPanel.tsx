import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "react-bootstrap-icons";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import { micromark } from "micromark";

import { api } from "@/api";
import { ApiError } from "@/api/client";
import type { MilestoneDataResponse, MilestoneProposal, MilestoneProposalLLMSchema } from "@/api/types";
import { resizeTextareaToMaxLines } from "@/services/textarea-resize.service";

// LLM proposals arrive as Markdown; Quill needs HTML.
// Already-saved descriptions are stored as Quill HTML and pass through unchanged.
function descriptionToHtml(description: string | null): string {
    if (!description) return "";
    const trimmed = description.trimStart();
    if (trimmed.startsWith("<")) return description; // already HTML from a prior Quill save
    return micromark(trimmed);
}

import "@/pages/my_goals/GoalCreationWizard/GoalCreationWizard.scss";
import "@/pages/my_goals/GoalMilestoneWizard/GoalMilestoneWizardPage.scss";
import "@/pages/assistant/RefinedGoalReviewPanel/RefinedGoalReviewPanel.scss";

const QUILL_MODULES = {
    toolbar: [
        [{ header: [2, 3, 4, false] }],
        ["bold", "italic", "underline"],
        [{ color: [] }, { background: [] }],
        [{ list: "ordered" }, { list: "bullet" }],
        ["blockquote", "code-block"],
        ["link"],
        ["clean"],
    ],
};

const QUILL_FORMATS = [
    "header",
    "bold",
    "italic",
    "underline",
    "color",
    "background",
    "list",
    "bullet",
    "blockquote",
    "code-block",
    "link",
    "clean",
];

function normaliseDescriptionHtml(value: string): string | null {
    const trimmed = value.trim();
    return trimmed === "" || trimmed === "<p><br></p>" ? null : trimmed;
}

function parsePositiveDays(value: string): number | null {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.floor(parsed);
}

type MilestoneFieldKey = "title" | "reason" | "estimated_duration_days";
type MilestoneFieldErrors = Partial<Record<MilestoneFieldKey, string>>;

function validate(title: string, reason: string, durationDays: string): MilestoneFieldErrors {
    const errors: MilestoneFieldErrors = {};

    if (!title.trim()) {
        errors.title = "Title is required.";
    }

    if (!reason.trim()) {
        errors.reason = "Please explain why this milestone matters.";
    }

    const hasDuration = durationDays.trim().length > 0;
    if (hasDuration && parsePositiveDays(durationDays) === null) {
        errors.estimated_duration_days = "Please enter a valid duration in days (positive whole number).";
    }

    return errors;
}

function getFirstError(errors: MilestoneFieldErrors): string | null {
    return errors.title ?? errors.reason ?? errors.estimated_duration_days ?? null;
}

function mapServerFieldErrors(fieldErrors: Partial<Record<string, string>>): MilestoneFieldErrors {
    const mapped: MilestoneFieldErrors = {};
    const titleMsg = fieldErrors.title;
    const reasonMsg = fieldErrors.reason;
    const durationMsg = fieldErrors.estimated_duration_days;
    if (typeof titleMsg === "string" && titleMsg.trim()) mapped.title = titleMsg;
    if (typeof reasonMsg === "string" && reasonMsg.trim()) mapped.reason = reasonMsg;
    if (typeof durationMsg === "string" && durationMsg.trim()) mapped.estimated_duration_days = durationMsg;
    return mapped;
}

interface MilestoneProposalReviewPanelProps {
    proposal: MilestoneProposal;
    onClose: () => void;
    onSaved?: (milestone: MilestoneDataResponse) => void | Promise<void>;
}

const SLIDE_OUT_DURATION_MS = 220;

export function MilestoneProposalReviewPanel({ proposal, onClose, onSaved }: MilestoneProposalReviewPanelProps) {
    const [title, setTitle] = useState(proposal.milestone.title);
    const [description, setDescription] = useState(() => descriptionToHtml(proposal.milestone.description));
    const [reason, setReason] = useState(proposal.milestone.reason);
    const [durationDays, setDurationDays] = useState(
        proposal.milestone.estimated_duration_days !== null ? String(proposal.milestone.estimated_duration_days) : ""
    );

    const reasonRef = useRef<HTMLTextAreaElement>(null);

    const [saving, setSaving] = useState(false);
    const [generalError, setGeneralError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<MilestoneFieldErrors>({});
    const [isClosing, setIsClosing] = useState(false);

    function requestClose() {
        if (isClosing) return;
        setIsClosing(true);
        window.setTimeout(onClose, SLIDE_OUT_DURATION_MS);
    }

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !saving) requestClose();
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [saving, isClosing]);

    useEffect(() => {
        if (reasonRef.current) resizeTextareaToMaxLines(reasonRef.current, 8);
    }, [reason]);

    function clearFieldError(key: MilestoneFieldKey) {
        setFieldErrors(prev => {
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });
        setGeneralError(null);
    }

    async function handleSave() {
        const trimmedTitle = title.trim();
        const trimmedReason = reason.trim();
        const normalisedDescription = normaliseDescriptionHtml(description);

        const errors = validate(trimmedTitle, trimmedReason, durationDays);
        if (Object.keys(errors).length > 0) {
            setFieldErrors(errors);
            return;
        }

        const parsedDays = durationDays.trim() ? parsePositiveDays(durationDays) : null;

        const payload: MilestoneProposalLLMSchema = {
            ...proposal.milestone,
            title: trimmedTitle,
            description: normalisedDescription,
            reason: trimmedReason,
            estimated_duration_days: parsedDays,
        };

        setSaving(true);
        setGeneralError(null);
        setFieldErrors({});

        try {
            const milestone = await api.milestones.saveFromProposal({
                proposal_id: proposal.proposal_id,
                milestone: payload,
            });
            await onSaved?.(milestone);
            requestClose();
        } catch (saveError) {
            if (saveError instanceof ApiError) {
                const mapped = mapServerFieldErrors(saveError.fieldErrors ?? {});
                setFieldErrors(mapped);
                setGeneralError(Object.keys(mapped).length === 0 ? saveError.message : null);
            } else {
                setGeneralError("We could not save the milestone right now. Please try again.");
            }
        } finally {
            setSaving(false);
        }
    }

    const effectiveErrors = fieldErrors;
    const footerError = getFirstError(effectiveErrors) ?? generalError;

    return (
        <div className="goal-refined-review-backdrop">
            <section className={`goal-refined-review-panel${isClosing ? " is-closing" : ""}`} aria-labelledby="milestone-proposal-review-title">

                <header className="goal-wizard-header p-0">
                    <div className="goal-wizard-header-main w-100">
                        <div className="goal-wizard-header-copy w-100">
                            <h3 id="milestone-proposal-review-title" className="d-flex align-items-center justify-content-between">
                                Review Milestone
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-icon goal-wizard-close"
                                    onClick={requestClose}
                                    aria-label="Close milestone review"
                                    disabled={saving}
                                >
                                    <ChevronRight size={25} />
                                </button>
                            </h3>
                            <p>Your coach has outlined this milestone. Review it, make any changes if needed, and save it to your goal.</p>
                        </div>
                    </div>
                </header>

                <div className="goal-wizard-body less-padding">
                    <div className="goal-wizard-review">
                        <div className="goal-wizard-review-form">
                            <div>
                                <label className="form-label" htmlFor="mp-title">Title</label>
                                <input
                                    id="mp-title"
                                    className={`form-control goal-wizard-title-input${effectiveErrors.title ? " is-invalid" : ""}`}
                                    value={title}
                                    onChange={e => { setTitle(e.target.value); clearFieldError("title"); }}
                                    title={effectiveErrors.title}
                                    disabled={saving}
                                    maxLength={255}
                                />
                            </div>

                            <div>
                                <label className="form-label">Description (optional)</label>
                                <ReactQuill
                                    className="goal-wizard-rich-editor"
                                    theme="snow"
                                    value={description}
                                    onChange={val => setDescription(val)}
                                    modules={QUILL_MODULES}
                                    formats={QUILL_FORMATS}
                                    readOnly={saving}
                                    placeholder="Add a brief description of this milestone..."
                                />
                            </div>

                            <div>
                                <label className="form-label" htmlFor="mp-reason">Why does this step matter?</label>
                                <textarea
                                    id="mp-reason"
                                    ref={reasonRef}
                                    className={`form-control goal-wizard-reason${effectiveErrors.reason ? " is-invalid" : ""}`}
                                    placeholder="Explain why completing this milestone is important for achieving your goal..."
                                    value={reason}
                                    onChange={e => {
                                        setReason(e.target.value);
                                        clearFieldError("reason");
                                        resizeTextareaToMaxLines(e.currentTarget, 8);
                                    }}
                                    title={effectiveErrors.reason}
                                    disabled={saving}
                                    maxLength={2000}
                                />
                            </div>

                            <div>
                                <label className="form-label" htmlFor="mp-duration">Estimated duration in days (optional)</label>
                                <input
                                    id="mp-duration"
                                    type="number"
                                    className={`form-control goal-wizard-days-input${effectiveErrors.estimated_duration_days ? " is-invalid" : ""}`}
                                    value={durationDays}
                                    onChange={e => { setDurationDays(e.target.value); clearFieldError("estimated_duration_days"); }}
                                    title={effectiveErrors.estimated_duration_days}
                                    placeholder="Example: 14"
                                    min={1}
                                    step={1}
                                    disabled={saving}
                                />
                            </div>
                        </div>

                        <div className="goal-wizard-footer">
                            <button
                                type="button"
                                className="btn btn-brand"
                                onClick={() => void handleSave()}
                                disabled={saving}
                            >
                                {saving ? "Saving..." : "Save"}
                            </button>
                            <button
                                type="button"
                                className="btn btn-soft"
                                onClick={requestClose}
                                disabled={saving}
                            >
                                Cancel
                            </button>
                            {footerError && (
                                <div className="alert alert-danger goal-wizard-inline-error mb-0">{footerError}</div>
                            )}
                        </div>
                    </div>
                </div>

            </section>
        </div>
    );
}
