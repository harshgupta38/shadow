import { Link } from "react-router-dom";
import { CalendarEvent, Diagram3, ClockHistory } from "react-bootstrap-icons";

import type { Goal } from "@/api";
import { Pill } from "@/components/ui/Pill";
import { formatDate, dueLabel } from "@/lib/format";
import { GOAL_STATUS_LABEL, GOAL_STATUS_PILL } from "@/lib/labels";

export function GoalCard({ goal }: { goal: Goal }) {
  const doneCount = goal.milestones.filter((m) => m.status === "done").length;
  const due = dueLabel(goal.target_date);
  const overdue = due?.startsWith("Overdue") && goal.status !== "completed";

  return (
    <Link to={`/goals/${goal.id}`} className="card card-hover card-interactive text-body h-100 text-decoration-none">
      <div className="card-body p-4 d-flex flex-column">
        <div className="d-flex align-items-center justify-content-between gap-2 mb-3">
          <div className="d-flex align-items-center gap-2 flex-wrap">
            {goal.category && <Pill variant="brand">{goal.category}</Pill>}
          </div>
          <Pill variant={GOAL_STATUS_PILL[goal.status]} dot>
            {GOAL_STATUS_LABEL[goal.status]}
          </Pill>
        </div>

        <h3 className="h6 fw-bold mb-1 line-clamp-2">{goal.title}</h3>
        {goal.description && (
          <p className="text-muted-2 small line-clamp-2 mb-3">{goal.description}</p>
        )}

        <div className="mt-auto">
          <div className="d-flex align-items-center justify-content-between mb-1">
            <span className="small fw-semibold text-muted-2">Progress</span>
            <span className="small fw-bold">{goal.progress}%</span>
          </div>
          <div className="progress goal-progress-track mb-3" style={{ height: 7 }}>
            <div className="progress-bar" style={{ width: `${goal.progress}%` }} />
          </div>

          <div className="d-flex align-items-center gap-3 text-faint" style={{ fontSize: "0.76rem" }}>
            {goal.milestones.length > 0 && (
              <span className="d-inline-flex align-items-center gap-1">
                <Diagram3 size={13} /> {doneCount}/{goal.milestones.length}
              </span>
            )}
            {goal.target_date && (
              <span
                className={`d-inline-flex align-items-center gap-1 ${overdue ? "text-danger" : ""}`}
              >
                {overdue ? <ClockHistory size={13} /> : <CalendarEvent size={13} />}
                {formatDate(goal.target_date)}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
