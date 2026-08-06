import { Check2Circle, ChevronLeft } from "react-bootstrap-icons";

interface GoalWizardReviewProps {
    goalData: unknown;
    saving: boolean;
    error: string | null;
    onBack: () => void;
    onConfirm: () => void;
}

export function GoalWizardReview({ goalData, saving, error, onBack, onConfirm }: GoalWizardReviewProps) {
    const jsonPreview = JSON.stringify(goalData, null, 2);

    return (
        <div className="goal-wizard-body">
            <div className="goal-wizard-review" aria-live="polite">
                <div className="goal-wizard-loader-head goal-wizard-review-head">
                    <div className="goal-wizard-success-icon">
                        <Check2Circle size={28} />
                    </div>
                    <div className="goal-wizard-review-copy goal-wizard-stage-header">
                        <h3>Review Your Goal</h3>
                        <p>Your coach has organized your ideas into a structured goal. Review it, make any changes if needed, and save it.</p>
                    </div>
                </div>

                {error && <div className="alert alert-danger py-2 px-3 small mb-0">{error}</div>}

                <pre className="goal-wizard-review-json">{jsonPreview}</pre>

                <div className="goal-wizard-footer">
                    <button type="button" className="btn btn-soft" onClick={onBack} disabled={saving}>
                        <ChevronLeft size={16} className="me-1" /> Edit Answers
                    </button>
                    <button type="button" className="btn btn-brand" onClick={onConfirm} disabled={saving}>
                        {saving ? "Saving Goal..." : "Confirm & Create Goal"}
                    </button>
                </div>
            </div>
        </div>
    );
}