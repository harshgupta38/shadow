import { CheckLg, PlusLg, Stars } from "react-bootstrap-icons";
import { Link } from "react-router-dom";

import { ROUTES } from "@/routes/RoutePaths";

import "./GoalMilestonesSection.scss";

interface GoalMilestonesSectionProps {
    goalId: number;
}

export function GoalMilestonesSection({ goalId }: GoalMilestonesSectionProps) {
    const setMilestonePath = ROUTES.MY_GOAL_MILESTONE_CREATE.replace(":goalId", String(goalId));

    return (
        <section className="surface goal-milestones-section" aria-labelledby="goal-milestones-title">
            <header className="goal-milestones-header">
                <div>
                    <h2 id="goal-milestones-title" className="goal-milestones-title">Milestones</h2>
                    <p className="goal-milestones-subtitle">Break this goal into concrete steps</p>
                </div>

                <div className="goal-milestones-actions" aria-label="Milestones actions">
                    <Link to={setMilestonePath} className="btn btn-brand btn-sm">
                        <PlusLg size={14} className="me-1" /> Set Milestone
                    </Link>
                    <button type="button" className="btn btn-soft btn-sm">
                        <Stars size={14} className="me-1" /> Ask Goal Coach
                    </button>
                </div>
            </header>

            <div className="goal-milestones-empty" role="status" aria-live="polite">
                <div className="goal-milestones-empty-icon" aria-hidden="true">
                    <CheckLg size={22} />
                </div>
                <h3 className="goal-milestones-empty-title">No milestones yet</h3>
                <p className="goal-milestones-empty-text">
                    Add a few concrete steps, or ask the Goal Coach to suggest some.
                </p>
            </div>
        </section>
    );
}
