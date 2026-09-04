import "@/pages/my_goals/GoalDetailLoadingSkeleton/GoalDetailLoadingSkeleton.scss";

export function GoalDetailLoadingSkeleton() {
  return (
    <div className="goal-detail-skeleton-wrap" aria-label="Loading goal details" aria-busy="true">
      <article className="surface goal-detail-skeleton-card" aria-hidden="true">
        <div className="goal-detail-skeleton-hero">
          <span className="goal-detail-skeleton goal-detail-skeleton-ring" />

          <div className="goal-detail-skeleton-content">
            <div className="goal-detail-skeleton-badges">
              <span className="goal-detail-skeleton goal-detail-skeleton-pill goal-detail-skeleton-pill-sm" />
              <span className="goal-detail-skeleton goal-detail-skeleton-pill goal-detail-skeleton-pill-sm" />
              <span className="goal-detail-skeleton goal-detail-skeleton-pill goal-detail-skeleton-pill-md" />
            </div>

            <span className="goal-detail-skeleton goal-detail-skeleton-title" />
            <span className="goal-detail-skeleton goal-detail-skeleton-text" />
          </div>
        </div>
      </article>

      <article className="surface goal-detail-skeleton-card goal-detail-skeleton-details" aria-hidden="true">
        <section className="goal-detail-skeleton-section">
          <span className="goal-detail-skeleton goal-detail-skeleton-heading" />
          <span className="goal-detail-skeleton goal-detail-skeleton-line" />
          <span className="goal-detail-skeleton goal-detail-skeleton-line goal-detail-skeleton-line-short" />
        </section>

        <section className="goal-detail-skeleton-section">
          <span className="goal-detail-skeleton goal-detail-skeleton-heading" />
          <span className="goal-detail-skeleton goal-detail-skeleton-line" />
          <span className="goal-detail-skeleton goal-detail-skeleton-line goal-detail-skeleton-line-short" />
        </section>
      </article>
    </div>
  );
}