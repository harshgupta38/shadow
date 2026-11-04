import type { WorkoutPlanProposal } from "@/api/types";
import { GOAL_LABEL, LEVEL_LABEL, WEEKDAY_SHORT, pluralize } from "@/pages/workout/WorkoutPage.constants";
import "./WorkoutPlanCard.scss";

interface WorkoutPlanCardProps {
  proposal: WorkoutPlanProposal;
  onReview: () => void;
  onView: () => void;
}

/** A plan the Workout Coach drafted, shown inside its chat message. Until it is saved the card opens the review panel. */
export function WorkoutPlanCard({ proposal, onReview, onView }: WorkoutPlanCardProps) {
  const { plan } = proposal;
  const exerciseCount = plan.days.reduce((total, day) => total + day.exercises.length, 0);
  const saved = proposal.plan_action === "view";

  return (
    <div className="workout-plan-card">
      <span className="workout-plan-card-label">Workout plan</span>
      <strong className="workout-plan-card-title">{plan.name}</strong>
      <span className="workout-plan-card-sub">
        {pluralize(plan.days.length, "day")} a week · {pluralize(exerciseCount, "exercise")} · {GOAL_LABEL[plan.goal]} · {LEVEL_LABEL[plan.level]}
      </span>
      <div className="workout-plan-card-days">
        {plan.days.map((day) => (
          <span key={day.weekday} className="workout-plan-card-day">
            <b>{WEEKDAY_SHORT[day.weekday]}</b> {day.name}
          </span>
        ))}
      </div>
      <button type="button" className="btn btn-link p-0 fw-medium text-decoration-none workout-plan-card-cta" onClick={saved ? onView : onReview}>
        {saved ? "View plan" : "Review & save"} &rarr;
      </button>
    </div>
  );
}
