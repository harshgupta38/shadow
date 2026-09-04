import MAIN_GOAL_MOUNTAIN from "@/assets/main_goal_mountain.png";

import "@/components/ui/IllustratedErrorState/IllustratedErrorState.scss";

interface IllustratedErrorStateProps {
  onRetry: () => void;
}

export function IllustratedErrorState({ onRetry }: IllustratedErrorStateProps) {
  return (
    <div className="surface illustrated-error-state" role="alert" aria-live="polite">
      <img src={MAIN_GOAL_MOUNTAIN} alt="Connection error illustration" className="illustrated-error-state-image" />
      <h2 className="illustrated-error-state-title">Oops, something seems off...</h2>
      <p className="illustrated-error-state-text">
        Keep calm, take a breath, and{" "}
        <button type="button" className="illustrated-error-state-link" onClick={onRetry}>
          try again
        </button>
        .
      </p>
    </div>
  );
}