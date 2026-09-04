type AssistantMessageSkeletonProps = {
  rows?: number;
};

const SKELETON_WIDTHS = ["62%", "41%", "74%", "47%", "69%", "53%"];

export function AssistantMessageSkeleton({ rows = 6 }: AssistantMessageSkeletonProps) {
  return (
    <div className="assistant-message-skeleton" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => {
        const isUser = index % 2 === 0;
        return (
          <div
            key={index}
            className={`assistant-message-skeleton-row ${isUser ? "is-user" : "is-assistant"}`}
          >
            <div
              className="assistant-message-skeleton-bubble"
              style={{ width: SKELETON_WIDTHS[index % SKELETON_WIDTHS.length] }}
            />
            <span className="assistant-message-skeleton-time" />
          </div>
        );
      })}
    </div>
  );
}
