import { CheckLg, Trash3 } from "react-bootstrap-icons";

import type { PlannedTask } from "@/api";
import { dueLabel } from "@/lib/format";

interface TaskItemProps {
  task: PlannedTask;
  goalTitle?: string | null;
  onToggle: (task: PlannedTask) => void;
  onDelete?: (task: PlannedTask) => void;
  busy?: boolean;
}

export function TaskItem({ task, goalTitle, onToggle, onDelete, busy }: TaskItemProps) {
  const done = task.status === "done";
  const missed = task.status === "missed";
  const due = dueLabel(task.date);

  return (
    <div className="d-flex align-items-center gap-3 py-2">
      <button
        type="button"
        className="btn p-0 border-0 flex-shrink-0"
        onClick={() => onToggle(task)}
        disabled={busy}
        aria-label={done ? "Mark as not done" : "Mark as done"}
        title={done ? "Mark as not done" : "Mark as done"}
        style={{
          width: 24,
          height: 24,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          background: done ? "var(--jv-brand-gradient)" : "transparent",
          border: done ? "none" : "2px solid var(--jv-border-strong)",
          color: "#fff",
          transition: "all 160ms ease",
        }}
      >
        {done && <CheckLg size={14} />}
      </button>

      <div className="flex-grow-1 min-w-0">
        <div
          className={`fw-medium text-truncate ${done ? "text-decoration-line-through text-muted-2" : ""}`}
        >
          {task.title}
        </div>
        <div className="d-flex align-items-center gap-2 mt-1">
          {goalTitle && (
            <span className="text-faint small text-truncate" style={{ maxWidth: 160 }}>
              {goalTitle}
            </span>
          )}
          {!done && due && (
            <span className={`small ${missed ? "text-danger" : "text-faint"}`}>{due}</span>
          )}
        </div>
      </div>

      {onDelete && (
        <button
          type="button"
          className="btn btn-ghost btn-icon flex-shrink-0"
          style={{ width: 34, height: 34 }}
          onClick={() => onDelete(task)}
          disabled={busy}
          aria-label="Delete task"
          title="Delete task"
        >
          <Trash3 size={15} />
        </button>
      )}
    </div>
  );
}
