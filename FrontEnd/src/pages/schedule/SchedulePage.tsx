import { useMemo, useState } from "react";
import { CalendarCheckFill, PencilSquare, PlusLg, Trash3 } from "react-bootstrap-icons";

import { api, ApiError, type PlannedTask } from "@/api";
import { ScheduleTaskModal } from "@/components/plan/ScheduleTaskModal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { SectionCard } from "@/components/ui/SectionCard";
import { useToast } from "@/context/ToastContext";
import { useAsync } from "@/hooks/useAsync";
import { formatDate, toISODate } from "@/lib/format";

type PillVariant = "success" | "warn" | "danger" | "info" | "brand" | "muted";
type ScheduleFilter = "due" | "scheduled" | "done";

const PRIORITY_LABEL: Record<PlannedTask["priority"], string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const PRIORITY_PILL: Record<PlannedTask["priority"], PillVariant> = {
  critical: "danger",
  high: "warn",
  medium: "info",
  low: "muted",
};

const FILTER_META: Record<
  ScheduleFilter,
  {
    label: string;
    emptyTitle: string;
    emptyMessage: string;
  }
> = {
  due: {
    label: "Due",
    emptyTitle: "No due tasks",
    emptyMessage: "No pending tasks are due right now.",
  },
  scheduled: {
    label: "Scheduled",
    emptyTitle: "No scheduled tasks",
    emptyMessage: "No future planned tasks found.",
  },
  done: {
    label: "Done",
    emptyTitle: "No completed tasks",
    emptyMessage: "Completed tasks will show up here.",
  },
};

const FILTER_ORDER: ScheduleFilter[] = ["due", "scheduled", "done"];

function stripHtml(value: string | null): string {
  if (!value) return "";
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function sortTasks(rows: PlannedTask[]): PlannedTask[] {
  return [...rows].sort((left, right) => {
    if (left.date !== right.date) return left.date.localeCompare(right.date);
    const priorityRank: Record<PlannedTask["priority"], number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };
    const byPriority = priorityRank[left.priority] - priorityRank[right.priority];
    if (byPriority !== 0) return byPriority;
    return left.id - right.id;
  });
}

function classifyTask(task: PlannedTask, todayIso: string): ScheduleFilter | null {
  if (task.source !== "manual") {
    return null;
  }

  if (task.status === "done") {
    return "done";
  }
  if (task.date <= todayIso) {
    return "due";
  }
  return "scheduled";
}

export function SchedulePage() {
  const toast = useToast();
  const todayIso = toISODate();

  const tasksQuery = useAsync(() => api.plan.list(), []);
  const goalsQuery = useAsync(() => api.goals.list("active"), []);
  const habitsQuery = useAsync(() => api.repetitiveTasks.list(), []);

  const [showModal, setShowModal] = useState(false);
  const [filter, setFilter] = useState<ScheduleFilter>("scheduled");
  const [editingTask, setEditingTask] = useState<PlannedTask | null>(null);
  const [deletingTask, setDeletingTask] = useState<PlannedTask | null>(null);
  const [deleting, setDeleting] = useState(false);

  const tasks = useMemo(() => sortTasks(tasksQuery.data ?? []), [tasksQuery.data]);
  const filteredTasks = useMemo(
    () =>
      tasks.filter((task) => {
        const category = classifyTask(task, todayIso);
        return category !== null && category === filter;
      }),
    [filter, tasks, todayIso],
  );
  const filterCounts = useMemo(() => {
    const counts: Record<ScheduleFilter, number> = {
      done: 0,
      due: 0,
      scheduled: 0,
    };
    for (const task of tasks) {
      const category = classifyTask(task, todayIso);
      if (category) {
        counts[category] += 1;
      }
    }
    return counts;
  }, [tasks, todayIso]);

  const goalTitleById = useMemo(
    () => new Map((goalsQuery.data ?? []).map((goal) => [goal.id, goal.title])),
    [goalsQuery.data],
  );

  const habitNameById = useMemo(
    () => new Map((habitsQuery.data ?? []).map((habit) => [habit.id, habit.name])),
    [habitsQuery.data],
  );

  function openCreateModal() {
    setEditingTask(null);
    setShowModal(true);
  }

  function handleSaved(task: PlannedTask, isNew: boolean) {
    tasksQuery.setData((prev) => {
      const list = prev ?? [];
      if (isNew) return sortTasks([task, ...list]);
      return sortTasks(list.map((row) => (row.id === task.id ? task : row)));
    });
  }

  async function confirmDelete() {
    if (!deletingTask) return;
    setDeleting(true);
    try {
      await api.plan.remove(deletingTask.id);
      tasksQuery.setData((prev) => (prev ?? []).filter((row) => row.id !== deletingTask.id));
      setDeletingTask(null);
      toast.success("Scheduled task deleted.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't delete this scheduled task.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Schedule"
        subtitle="Track due, scheduled, and completed tasks in one place."
        icon={<CalendarCheckFill size={20} />}
        actions={
          <button className="btn btn-brand" onClick={openCreateModal}>
            <PlusLg size={14} className="me-1" />Schedule Task
          </button>
        }
      />

      {!tasksQuery.loading && !tasksQuery.error && (
        <div className="mb-3">
          <div className="nav-tabs-jv" role="tablist" aria-label="Task state filters">
            {FILTER_ORDER.map((value) => {
              const meta = FILTER_META[value];
              const active = filter === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`nav-tab-jv ${active ? "active" : ""}`}
                  onClick={() => setFilter(value)}
                >
                  {meta.label} {filterCounts[value]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {tasksQuery.loading && <LoadingState label="Loading tasks..." />}

      {tasksQuery.error && !tasksQuery.loading && (
        <EmptyState
          icon={<CalendarCheckFill size={24} />}
          title="Couldn't load tasks"
          message={tasksQuery.error}
          action={
            <button className="btn btn-brand" onClick={tasksQuery.reload}>
              Retry
            </button>
          }
        />
      )}

      {!tasksQuery.loading && !tasksQuery.error && tasks.length === 0 && (
        <EmptyState
          icon={<CalendarCheckFill size={24} />}
          title="No tasks yet"
          message="Create your first task to start building momentum."
          action={
            <button className="btn btn-brand" onClick={openCreateModal}>
              <PlusLg size={14} className="me-1" />Schedule Task
            </button>
          }
        />
      )}

      {!tasksQuery.loading && !tasksQuery.error && tasks.length > 0 && filteredTasks.length === 0 && (
        <EmptyState
          icon={<CalendarCheckFill size={24} />}
          title={FILTER_META[filter].emptyTitle}
          message={FILTER_META[filter].emptyMessage}
          action={
            filter === "scheduled" ? (
              <button className="btn btn-brand" onClick={openCreateModal}>
                <PlusLg size={14} className="me-1" />Schedule Task
              </button>
            ) : undefined
          }
        />
      )}

      {!tasksQuery.loading && !tasksQuery.error && filteredTasks.length > 0 && (
        <div className="d-flex flex-column gap-3">
          {filteredTasks.map((task) => {
            const goalTitle = task.related_goal_id ? goalTitleById.get(task.related_goal_id) : null;
            const habitName = task.linked_habit_id ? habitNameById.get(task.linked_habit_id) : null;
            const description = stripHtml(task.description).slice(0, 220);

            return (
              <SectionCard
                key={task.id}
                title={task.title}
                subtitle={formatDate(`${task.date}T00:00:00`)}
                actions={
                  <div className="d-flex align-items-center gap-2">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setEditingTask(task);
                        setShowModal(true);
                      }}
                    >
                      <PencilSquare size={14} className="me-1" /> Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm text-danger"
                      onClick={() => setDeletingTask(task)}
                    >
                      <Trash3 size={14} className="me-1" /> Delete
                    </button>
                  </div>
                }
              >
                <div className="d-flex align-items-center flex-wrap gap-2 mb-2">
                  <Pill variant={PRIORITY_PILL[task.priority]}>{PRIORITY_LABEL[task.priority]}</Pill>
                  <Pill variant="brand">{task.date}</Pill>
                  {habitName && <Pill variant="info">Habit: {habitName}</Pill>}
                  {goalTitle && <Pill variant="muted">Goal: {goalTitle}</Pill>}
                </div>
                {description ? (
                  <p className="small text-muted-2 mb-0">{description}</p>
                ) : (
                  <p className="small text-faint mb-0">No additional details.</p>
                )}
              </SectionCard>
            );
          })}
        </div>
      )}

      {showModal && (
        <ScheduleTaskModal
          show={showModal}
          task={editingTask}
          initialDate={editingTask?.date ?? toISODate()}
          onClose={() => {
            setShowModal(false);
            setEditingTask(null);
          }}
          onSaved={handleSaved}
        />
      )}

      <ConfirmDialog
        show={deletingTask !== null}
        title="Delete this scheduled task?"
        message="This action cannot be undone."
        confirmLabel="Delete"
        destructive
        busy={deleting}
        onCancel={() => setDeletingTask(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
