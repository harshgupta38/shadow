import { CheckCircleFill, Clock, Calendar3 } from "react-bootstrap-icons";

import type { WorkoutPlanSummary } from "@/api/types";
import { ExerciseThumb } from "@/pages/workout/ExerciseThumb/ExerciseThumb";
import { MuscleChips } from "@/pages/workout/MuscleMap/MuscleMap";
import { WeekdayDots } from "@/pages/workout/WeekdayDots/WeekdayDots";
import { GOAL_LABEL, LEVEL_LABEL, LEVEL_PILL, SOURCE_LABEL, formatSessionDuration } from "@/pages/workout/WorkoutPage.constants";
import "./PlanCard.scss";

interface PlanCardProps {
  plan: WorkoutPlanSummary;
  busy?: boolean;
  /** Another plan is being switched, so this card's actions wait for it. */
  locked?: boolean;
  onOpen: (plan: WorkoutPlanSummary) => void;
  onActivate: (plan: WorkoutPlanSummary) => void;
  onDeactivate: (plan: WorkoutPlanSummary) => void;
}

export function PlanCard({ plan, busy = false, locked = false, onOpen, onActivate, onDeactivate }: PlanCardProps) {
  return (
    <article className={`wk-plan-card surface${plan.is_active ? " is-active" : ""}`}>
      <button type="button" className="wk-plan-card-main" onClick={() => onOpen(plan)} aria-label={`View ${plan.name}`}>
        <div className="wk-plan-cover">
          <ExerciseThumb
            exercise={{ name: plan.name, primary_muscles: plan.muscles, secondary_muscles: [] }}
            imageUrl={plan.cover_image_url}
            view="both"
            mapSize="sm"
          />
          <div className="wk-plan-badges">
            {plan.is_active && (
              <span className="pill pill-success"><CheckCircleFill size={11} aria-hidden="true" /> Active</span>
            )}
            <span className={`pill ${plan.source === "custom" ? "pill-brand" : ""}`}>{SOURCE_LABEL[plan.source]}</span>
          </div>
        </div>

        <div className="wk-plan-body">
          <h3 className="wk-plan-name">{plan.name}</h3>
          <p className="wk-plan-desc">{plan.description}</p>

          <div className="wk-plan-meta">
            <span><Calendar3 size={13} aria-hidden="true" /> {plan.days_per_week} days/week</span>
            <span><Clock size={13} aria-hidden="true" /> ~{formatSessionDuration(plan.avg_minutes * 60)}</span>
          </div>

          <div className="wk-plan-tags">
            <span className={`pill ${LEVEL_PILL[plan.level]}`}>{LEVEL_LABEL[plan.level]}</span>
            <span className="pill">{GOAL_LABEL[plan.goal]}</span>
          </div>

          <WeekdayDots active={plan.weekdays} />
          <MuscleChips primary={plan.muscles} max={4} />
        </div>
      </button>

      <footer className="wk-plan-actions">
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => onOpen(plan)}>
          View
        </button>
        {plan.is_active ? (
          <button type="button" className="btn btn-outline-secondary btn-sm" disabled={busy || locked} onClick={() => onDeactivate(plan)}>
            {busy ? "Stopping…" : "Stop following"}
          </button>
        ) : (
          <button type="button" className="btn btn-brand btn-sm" disabled={busy || locked} onClick={() => onActivate(plan)}>
            {busy ? "Switching…" : "Use this plan"}
          </button>
        )}
      </footer>
    </article>
  );
}
