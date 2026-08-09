import "@/pages/my_goals/GoalMilestonesSection/MilestoneLoadingSkeleton.scss";

interface MilestoneLoadingSkeletonProps {
    count?: number;
}

export function MilestoneLoadingSkeleton({ count = 3 }: MilestoneLoadingSkeletonProps) {
    return (
        <div className="goal-milestone-list" aria-label="Loading milestones" aria-busy="true">
            {Array.from({ length: count }, (_, index) => (
                <div key={index} className={`goal-milestone-item${index > 0 ? " has-separator" : ""}`} aria-hidden="true">
                    <div className="goal-milestone-check milestone-skeleton milestone-skeleton-checkbox" />

                    <div className="goal-milestone-body">
                        <div className="goal-milestone-title-row d-flex align-items-center justify-content-between">
                            <div className="milestone-skeleton milestone-skeleton-title" />
                            <div className="goal-milestone-controls">
                                <div className="milestone-skeleton milestone-skeleton-pill me-2" />
                                <div className="milestone-skeleton milestone-skeleton-icon" />
                            </div>
                        </div>

                        <div className="milestone-skeleton milestone-skeleton-description" />

                        <div className="goal-milestone-footer d-flex align-items-center gap-2">
                            <div className="milestone-skeleton milestone-skeleton-pill-2" />
                            <div className="milestone-skeleton milestone-skeleton-pill-2" />
                            <div className="milestone-skeleton milestone-skeleton-pill-2" />
                            <div className="milestone-skeleton milestone-skeleton-pill-2" />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
