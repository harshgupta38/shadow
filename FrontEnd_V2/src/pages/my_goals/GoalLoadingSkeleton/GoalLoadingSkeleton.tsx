import "@/pages/my_goals/GoalLoadingSkeleton/GoalLoadingSkeleton.scss";

interface GoalLoadingSkeletonProps {
  count: number;
}

export function GoalLoadingSkeleton({ count }: GoalLoadingSkeletonProps) {
  return (
    <div className="row g-3 my-goals-grid" aria-label="Loading goals" aria-busy="true">
      {Array.from({ length: count }, (_, index) => (
        <div className="col-md-6 col-xl-4" key={index}>
          <article className="surface goal-summary-card goal-summary-card-skeleton h-100" aria-hidden="true">
            <div className="goal-summary-card-head">
              <span className="goal-skeleton goal-skeleton-pill goal-skeleton-category" />
              <span className="goal-skeleton goal-skeleton-pill goal-skeleton-status" />
            </div>

            <div className="goal-skeleton goal-skeleton-title" />
            <div className="goal-skeleton goal-skeleton-text" />
            <div className="goal-skeleton goal-skeleton-text goal-skeleton-text-short" />

            <div className="goal-summary-progress-row">
              <span className="goal-skeleton goal-skeleton-label" />
              <span className="goal-skeleton goal-skeleton-value" />
            </div>

            <div className="goal-progress-track goal-skeleton-track">
              <div className="goal-skeleton goal-skeleton-bar" />
            </div>

            <div className="goal-summary-meta">
              <div className="goal-summary-meta-left">
                <span className="goal-skeleton goal-skeleton-meta" />
                <span className="goal-skeleton goal-skeleton-meta" />
              </div>
              <span className="goal-skeleton goal-skeleton-date" />
            </div>
          </article>
        </div>
      ))}
    </div>
  );
}