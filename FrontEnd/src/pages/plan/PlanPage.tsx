import { useMemo, useState } from "react";
import {
  CalendarCheckFill,
  ChevronLeft,
  ChevronRight,
  PlusLg,
} from "react-bootstrap-icons";

import { api, ApiError, type PlannedTask } from "@/api";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { SectionCard } from "@/components/ui/SectionCard";
import { TaskItem } from "@/components/tasks/TaskItem";
import { useToast } from "@/context/ToastContext";
import { useAsync } from "@/hooks/useAsync";
import { clampPercent, formatDate, toISODate } from "@/lib/format";

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function PlanPage() {
  const toast = useToast();
  const [date, setDate] = useState(toISODate());
  const [title, setTitle] = useState("");
  const [goalId, setGoalId] = useState<string>("");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const { data, loading, error, reload, setData } = useAsync(
    () => api.plan.list(date),
    [date],
  );
  const { data: goals } = useAsync(() => api.goals.list("active"), []);

  const tasks = data ?? [];
  const goalTitles = useMemo(() => {
    const map = new Map<number, string>();
    for (const g of goals ?? []) map.set(g.id, g.title);
    return map;
  }, [goals]);

  const doneCount = tasks.filter((t) => t.status === "done").length;
  const completion = tasks.length > 0 ? clampPercent((doneCount / tasks.length) * 100) : 0;
  const isToday = date === toISODate();

  const activeTasks = tasks.filter((t) => t.status !== "done");
  const doneTasks = tasks.filter((t) => t.status === "done");

  async function addTask() {
    if (!title.trim()) return;
    setAdding(true);
    try {
      const created = await api.plan.create({
        title: title.trim(),
        date,
        related_goal_id: goalId ? Number(goalId) : null,
      });
      setData((prev) => [...(prev ?? []), created]);
      setTitle("");
      setGoalId("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't add the task.");
    } finally {
      setAdding(false);
    }
  }

  async function toggleTask(task: PlannedTask) {
    const nextStatus = task.status === "done" ? "planned" : "done";
    setBusyId(task.id);
    setData((prev) =>
      (prev ?? []).map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)),
    );
    try {
      await api.plan.update(task.id, { status: nextStatus });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update the task.");
      reload();
    } finally {
      setBusyId(null);
    }
  }

  async function deleteTask(task: PlannedTask) {
    setBusyId(task.id);
    setData((prev) => (prev ?? []).filter((t) => t.id !== task.id));
    try {
      await api.plan.remove(task.id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't delete the task.");
      reload();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Today's plan"
        subtitle="A short, honest list beats a long one. Plan it, then do it."
        icon={<CalendarCheckFill size={20} />}
      />

      {/* Date navigation */}
      <div className="d-flex align-items-center justify-content-between gap-2 mb-4">
        <div className="d-flex align-items-center gap-2">
          <button
            className="btn btn-outline-secondary btn-icon"
            onClick={() => setDate((d) => shiftDate(d, -1))}
            aria-label="Previous day"
          >
            <ChevronLeft size={16} />
          </button>
          <input
            type="date"
            className="form-control"
            style={{ maxWidth: 180 }}
            value={date}
            onChange={(e) => setDate(e.target.value || toISODate())}
          />
          <button
            className="btn btn-outline-secondary btn-icon"
            onClick={() => setDate((d) => shiftDate(d, 1))}
            aria-label="Next day"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        {!isToday && (
          <button className="btn btn-ghost btn-sm" onClick={() => setDate(toISODate())}>
            Jump to today
          </button>
        )}
      </div>

      <div className="row g-4">
        <div className="col-lg-8">
          <SectionCard title={isToday ? "Today" : formatDate(`${date}T00:00:00`)}>
            {/* Add task */}
            <div className="d-flex flex-column flex-sm-row gap-2 mb-3">
              <input
                className="form-control"
                placeholder="What will you get done?"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void addTask();
                  }
                }}
              />
              {(goals?.length ?? 0) > 0 && (
                <select
                  className="form-select"
                  style={{ maxWidth: 200 }}
                  value={goalId}
                  onChange={(e) => setGoalId(e.target.value)}
                  aria-label="Link to goal"
                >
                  <option value="">No goal</option>
                  {goals?.map((g) => (
                    <option value={g.id} key={g.id}>
                      {g.title}
                    </option>
                  ))}
                </select>
              )}
              <button
                className="btn btn-brand flex-shrink-0"
                onClick={addTask}
                disabled={adding || !title.trim()}
              >
                <PlusLg size={16} className="me-1" /> Add
              </button>
            </div>

            {loading && <LoadingState label="Loading your plan…" full={false} />}

            {error && !loading && (
              <EmptyState
                compact
                icon={<CalendarCheckFill size={22} />}
                title="Couldn't load your plan"
                message={error}
                action={
                  <button className="btn btn-brand btn-sm" onClick={reload}>
                    Retry
                  </button>
                }
              />
            )}

            {!loading && !error && tasks.length === 0 && (
              <EmptyState
                compact
                icon={<CalendarCheckFill size={22} />}
                title="Nothing planned"
                message="Add two or three meaningful tasks to build momentum."
              />
            )}

            {!loading && !error && tasks.length > 0 && (
              <>
                {activeTasks.length > 0 && (
                  <div className="mb-2">
                    {activeTasks.map((task) => (
                      <TaskItem
                        key={task.id}
                        task={task}
                        goalTitle={task.related_goal_id ? goalTitles.get(task.related_goal_id) : null}
                        onToggle={toggleTask}
                        onDelete={deleteTask}
                        busy={busyId === task.id}
                      />
                    ))}
                  </div>
                )}

                {doneTasks.length > 0 && (
                  <div>
                    <div className="nav-section-label px-0">Completed</div>
                    {doneTasks.map((task) => (
                      <TaskItem
                        key={task.id}
                        task={task}
                        goalTitle={task.related_goal_id ? goalTitles.get(task.related_goal_id) : null}
                        onToggle={toggleTask}
                        onDelete={deleteTask}
                        busy={busyId === task.id}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </SectionCard>
        </div>

        {/* Summary */}
        <div className="col-lg-4">
          <div className="surface p-4 text-center">
            <ProgressRing value={completion} size={132} stroke={12} />
            <h3 className="h6 fw-bold mt-3 mb-1">
              {doneCount} of {tasks.length} done
            </h3>
            <p className="text-muted-2 small mb-0">
              {tasks.length === 0
                ? "Plan a few tasks to get started."
                : completion === 100
                  ? "Everything done — nice work!"
                  : "Keep going, you've got this."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
