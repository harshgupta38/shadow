import { useDndMonitor } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRef } from "react";
import { CalendarCheck, Compass, Diagram3 } from "react-bootstrap-icons";
import { useNavigate } from "react-router-dom";

import { type GoalDataShortResponse } from "@/api";
import { ROUTES } from "@/routes/RoutePaths";
import { formatDisplayDate } from "@/services/date.service";
import "@/pages/my_goals/MyGoalsPage.scss";

interface GoalCardProps {
  goal: GoalDataShortResponse;
  dragDisabled?: boolean;
}

function getMilestoneProgressPercent(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((completed / total) * 100)));
}

export function GoalCard({ goal, dragDisabled = false }: GoalCardProps) {
  const navigate = useNavigate();

  // Track whether this card was dragged so we can suppress the post-drop click
  const wasDragged = useRef(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: goal.id,
    disabled: dragDisabled,
  });

  const resetDragFlag = () => setTimeout(() => { wasDragged.current = false; }, 0);

  useDndMonitor({
    onDragStart: ({ active }) => {
      if (active.id === goal.id) wasDragged.current = true;
    },
    onDragEnd: resetDragFlag,
    onDragCancel: resetDragFlag,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
    zIndex: isDragging ? 1 : undefined,
  };

  const progress = getMilestoneProgressPercent(goal.milestones_completed, goal.milestones_total);

  function handleClick() {
    if (wasDragged.current) return;
    navigate(ROUTES.MY_GOAL_DETAIL.replace(":goalId", String(goal.id)));
  }

  return (
    <div ref={setNodeRef} style={style} className="col-md-6 col-xl-4">
      <article
        className={[
          "surface goal-summary-card h-100",
          !dragDisabled && "goal-summary-card--draggable",
          isDragging && "goal-summary-card--dragging",
        ].filter(Boolean).join(" ")}
        onClick={handleClick}
        {...(!dragDisabled ? attributes : {})}
        {...(!dragDisabled ? listeners : {})}
      >
        <div className="goal-summary-card-head">
          <span className="goal-summary-category">{goal.category}</span>
          <span className={`goal-summary-status goal-summary-status-${goal.status.toLowerCase()}`}>
            {goal.status}
          </span>
        </div>

        <h3 className="goal-summary-title">{goal.title}</h3>
        <p className="goal-summary-text">{goal.summary}</p>

        <div className="goal-summary-progress-row">
          <span>Progress</span>
          <strong>{progress}%</strong>
        </div>
        <div className="progress goal-progress-track mb-3" style={{ height: 7 }}>
          <div className="progress-bar" style={{ width: `${progress}%` }} />
        </div>

        <div className="goal-summary-meta">
          <div className="goal-summary-meta-left">
            <span>
              <Diagram3 size={13} /> {goal.milestones_completed}/{goal.milestones_total}
            </span>
            <span>
              <Compass size={13} /> {goal.habits_active}/{goal.habits_total}
            </span>
          </div>
          <span className="goal-summary-meta-date">
            <CalendarCheck size={13} /> {formatDisplayDate(goal.target_date)}
          </span>
        </div>
      </article>
    </div>
  );
}
