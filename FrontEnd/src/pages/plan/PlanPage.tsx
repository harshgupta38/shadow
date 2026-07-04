import { useMemo, useState } from "react";
import {
  ArrowRepeat,
  CalendarCheckFill,
  ChevronLeft,
  ChevronRight,
  Clock,
  ListOl,
  PlusLg,
} from "react-bootstrap-icons";

import { api, ApiError, type PlannedTask } from "@/api";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { SectionCard } from "@/components/ui/SectionCard";
import { TaskItem } from "@/components/tasks/TaskItem";
import { useToast } from "@/context/ToastContext";
import { useAsync } from "@/hooks/useAsync";
import { clampPercent, formatDate, formatMinutes, toISODate } from "@/lib/format";

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

function normalizeTitle(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function resolveRealtimeStreak(
  status: PlannedTask["status"],
  habitStreak: {
    highest_streak_days: number;
    current_streak_days: number;
    last_completed_days_ago: number | null;
  } | undefined,
): { highest: number; current: number } {
  const baseHighest = habitStreak?.highest_streak_days ?? 0;
  const baseCurrent = habitStreak?.current_streak_days ?? 0;
  const lastCompletedDaysAgo = habitStreak?.last_completed_days_ago ?? null;

  if (status === "done") {
    const shouldBumpForToday = lastCompletedDaysAgo === null || lastCompletedDaysAgo > 0;
    const current = shouldBumpForToday ? baseCurrent + 1 : baseCurrent;
    return {
      highest: Math.max(baseHighest, current),
      current,
    };
  }

  if (lastCompletedDaysAgo === 0 && baseCurrent > 0) {
    const current = baseCurrent - 1;
    const highest = baseHighest === baseCurrent ? Math.max(current, baseHighest - 1) : baseHighest;
    return {
      highest,
      current,
    };
  }

  return {
    highest: baseHighest,
    current: baseCurrent,
  };
}

type PillVariant = "success" | "warn" | "danger" | "info" | "brand" | "muted";

interface PlanSummaryItem {
  task_id: number;
  title: string;
  source: PlannedTask["source"];
  priority: PlannedTask["priority"];
  estimated_duration_minutes: number | null;
  suggested_start_time: string | null;
  suggested_finish_by_time: string | null;
  status: PlannedTask["status"];
}

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

export function PlanPage() {
  const toast = useToast();
  const [date, setDate] = useState(toISODate());
  const [title, setTitle] = useState("");
  const [goalId, setGoalId] = useState<string>("");
  const [adding, setAdding] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const { data, loading, error, reload, setData } = useAsync(
    () => api.plan.workspace(date),
    [date],
  );
  const { data: goals } = useAsync(() => api.goals.list("active"), []);

  const tasks = data?.tasks ?? [];
  const executionOrder = data?.execution_order ?? [];
  const insights = data?.insights;

  const executionHintByTask = useMemo(() => {
    const map = new Map<
      number,
      {
        order: number;
        suggested_start_time: string | null;
        suggested_finish_by_time: string | null;
      }
    >();
    executionOrder.forEach((item, index) => {
      map.set(item.task_id, {
        order: index + 1,
        suggested_start_time: item.suggested_start_time,
        suggested_finish_by_time: item.suggested_finish_by_time,
      });
    });
    return map;
  }, [executionOrder]);

  const taskById = useMemo(() => {
    const map = new Map<number, PlannedTask>();
    tasks.forEach((task) => {
      map.set(task.id, task);
    });
    return map;
  }, [tasks]);

  const planSummaryItems = useMemo<PlanSummaryItem[]>(() => {
    const plannedRows: PlanSummaryItem[] = executionOrder.map((item) => {
      const task = taskById.get(item.task_id);
      return {
        ...item,
        status: task?.status ?? "planned",
      };
    });

    const includedTaskIds = new Set(plannedRows.map((row) => row.task_id));
    const completedRows: PlanSummaryItem[] = tasks
      .filter((task) => task.status === "done" && !includedTaskIds.has(task.id))
      .sort((left, right) => {
        const leftOrder = left.execution_order ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = right.execution_order ?? Number.MAX_SAFE_INTEGER;
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;
        return left.id - right.id;
      })
      .map((task) => ({
        task_id: task.id,
        title: task.title,
        source: task.source,
        priority: task.priority,
        estimated_duration_minutes: task.estimated_duration_minutes,
        suggested_start_time: task.suggested_start_time,
        suggested_finish_by_time: task.suggested_finish_by_time,
        status: task.status,
      }));

    return [...plannedRows, ...completedRows];
  }, [executionOrder, taskById, tasks]);

  const habitStreakByTaskId = useMemo(() => {
    const rows = insights?.habit_streak_summary ?? [];
    const exactByTitle = new Map<string, (typeof rows)[number]>();
    rows.forEach((row) => {
      exactByTitle.set(normalizeTitle(row.task_title), row);
    });

    const mapped = new Map<number, (typeof rows)[number]>();
    planSummaryItems.forEach((orderItem) => {
      const titleKey = normalizeTitle(orderItem.title);
      const exact = exactByTitle.get(titleKey);
      if (exact) {
        mapped.set(orderItem.task_id, exact);
        return;
      }

      const fuzzy = rows.find((row) => {
        const rowKey = normalizeTitle(row.task_title);
        return rowKey.includes(titleKey) || titleKey.includes(rowKey);
      });
      if (fuzzy) {
        mapped.set(orderItem.task_id, fuzzy);
      }
    });

    return mapped;
  }, [planSummaryItems, insights?.habit_streak_summary]);

  const goalTitles = useMemo(() => {
    const map = new Map<number, string>();
    for (const g of goals ?? []) map.set(g.id, g.title);
    return map;
  }, [goals]);

  const doneCount = tasks.filter((t) => t.status === "done").length;
  const completion = tasks.length > 0 ? clampPercent((doneCount / tasks.length) * 100) : 0;
  const isToday = date === toISODate();

  const nextTaskTitle = useMemo(() => {
    const nextPending = planSummaryItems.find((item) => item.status !== "done");
    return nextPending?.title ?? null;
  }, [planSummaryItems]);

  const nextTaskMessage = useMemo(() => {
    if (nextTaskTitle) {
      return null;
    }
    if (tasks.length > 0 && doneCount === tasks.length) {
      return "All planned work is complete. Keep this momentum going.";
    }
    return "No pending tasks yet. Generate a plan or add your first task.";
  }, [doneCount, nextTaskTitle, tasks.length]);

  const activeTasks = useMemo(() => {
    const rows = tasks.filter((task) => task.status !== "done");
    return [...rows].sort((left, right) => {
      const leftOrder = executionHintByTask.get(left.id)?.order ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = executionHintByTask.get(right.id)?.order ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return left.id - right.id;
    });
  }, [executionHintByTask, tasks]);

  const doneTasks = tasks.filter((t) => t.status === "done");

  function updateWorkspaceTasks(update: (rows: PlannedTask[]) => PlannedTask[]) {
    setData((prev) => (prev ? { ...prev, tasks: update(prev.tasks) } : prev));
  }

  async function addTask() {
    if (!title.trim()) return;
    setAdding(true);
    try {
      const created = await api.plan.create({
        title: title.trim(),
        date,
        related_goal_id: goalId ? Number(goalId) : null,
      });
      updateWorkspaceTasks((prev) => [...prev, created]);
      setTitle("");
      setGoalId("");
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't add the task.");
    } finally {
      setAdding(false);
    }
  }

  async function toggleTask(task: PlannedTask) {
    const nextStatus = task.status === "done" ? "planned" : "done";
    setBusyId(task.id);
    updateWorkspaceTasks((prev) =>
      prev.map((entry) => (entry.id === task.id ? { ...entry, status: nextStatus } : entry)),
    );
    try {
      const updated = await api.plan.update(task.id, { status: nextStatus });
      updateWorkspaceTasks((prev) =>
        prev.map((entry) => (entry.id === task.id ? updated : entry)),
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update the task.");
      reload();
    } finally {
      setBusyId(null);
    }
  }

  async function deleteTask(task: PlannedTask) {
    setBusyId(task.id);
    updateWorkspaceTasks((prev) => prev.filter((entry) => entry.id !== task.id));
    try {
      await api.plan.remove(task.id);
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't delete the task.");
      reload();
    } finally {
      setBusyId(null);
    }
  }

  async function generatePlan() {
    setGenerating(true);
    try {
      const workspace = await api.plan.generateToday({ on_date: date });
      setData(workspace);
      toast.success(isToday ? "Today's plan generated." : "Plan generated for selected date.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't generate the plan.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Today's plan"
        subtitle="A short, honest list beats a long one. Plan it, then do it."
        icon={<CalendarCheckFill size={20} />}
        actions={
          <button className="btn btn-brand" onClick={generatePlan} disabled={generating}>
            <ArrowRepeat size={14} className="me-1" />
            {generating ? "Generating..." : isToday ? "Generate Today's Plan" : "Generate Plan"}
          </button>
        }
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
          <SectionCard title="Daily insights" subtitle="What Shadow noticed for this date.">
            {loading && <LoadingState label="Analyzing your day…" full={false} />}

            {!loading && !error && insights && (
              <>
                <div className="row g-3 mb-3">
                  <div className="col-sm-6 col-xl-3">
                    <div className="surface-2 p-3 h-100">
                      <div className="text-faint small">Missed yesterday</div>
                      <div className="fw-semibold">{insights.missed_yesterday_count}</div>
                    </div>
                  </div>
                  <div className="col-sm-6 col-xl-3">
                    <div className="surface-2 p-3 h-100">
                      <div className="text-faint small">Carry forward</div>
                      <div className="fw-semibold">{insights.carry_forward_count}</div>
                    </div>
                  </div>
                  <div className="col-sm-6 col-xl-3">
                    <div className="surface-2 p-3 h-100">
                      <div className="text-faint small">Workload</div>
                      <div className="fw-semibold">{insights.workload_label}</div>
                    </div>
                  </div>
                  <div className="col-sm-6 col-xl-3">
                    <div className="surface-2 p-3 h-100">
                      <div className="text-faint small">Estimated time</div>
                      <div className="fw-semibold">
                        {formatMinutes(insights.estimated_workload_minutes)}
                      </div>
                    </div>
                  </div>
                </div>

                {nextTaskTitle ? (
                  <div className="small text-muted-2 mb-2">
                    Your next task: <span className="fw-semibold">{nextTaskTitle}</span>
                  </div>
                ) : (
                  nextTaskMessage && (
                    <div className="small text-muted-2 mb-2 fw-semibold">
                      {nextTaskMessage}
                    </div>
                  )
                )}

                {insights.carry_forward_titles.length > 0 && (
                  <div className="small text-muted-2">
                    Carry-forward: {insights.carry_forward_titles.join(", ")}
                  </div>
                )}
              </>
            )}
          </SectionCard>

          <div className="mt-4">
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
                        showPriority
                        executionHint={executionHintByTask.get(task.id)}
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
        </div>

        {/* Summary */}
        <div className="col-lg-4">
          <div className="d-flex flex-column gap-4">
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
              {data?.generated_at && (
                <div className="text-faint mt-2" style={{ fontSize: "0.72rem" }}>
                  Last generated {formatDate(data.generated_at)}
                </div>
              )}
            </div>

            <SectionCard
              title="Today's plan summary"
              subtitle="A quick snapshot of planned items and timing for today."
              actions={<ListOl size={16} className="text-faint" />}
            >
              {planSummaryItems.length === 0 ? (
                <EmptyState
                  compact
                  icon={<Clock size={20} />}
                  title="No plan summary yet"
                  message="Generate a plan to see today's planned items and timing."
                />
              ) : (
                <div className="d-flex flex-column gap-2">
                  {planSummaryItems.slice(0, 8).map((item) => {
                    const habitStreak = habitStreakByTaskId.get(item.task_id);
                    const isDone = item.status === "done";
                    const showTiming = item.source === "ai_generated";
                    const realtimeStreak = resolveRealtimeStreak(item.status, habitStreak);
                    const timeLabel = showTiming && item.suggested_start_time && item.suggested_finish_by_time
                      ? `${item.suggested_start_time}-${item.suggested_finish_by_time}`
                      : showTiming && item.suggested_start_time
                        ? `Starts ${item.suggested_start_time}`
                        : null;
                    const durationLabel = showTiming && item.estimated_duration_minutes
                      ? formatMinutes(item.estimated_duration_minutes)
                      : null;
                    const timingDetail = [timeLabel, durationLabel].filter(Boolean).join(" · ");

                    return (
                      <div key={item.task_id} className="surface-2 p-3">
                        <div className="d-flex align-items-center justify-content-between gap-2">
                          <span className={`small fw-semibold text-truncate ${isDone ? "text-muted-2" : ""}`}>
                            {item.title}
                          </span>
                          <div className="d-flex align-items-center gap-2">
                            {isDone && (
                              <Pill variant="success" className="text-nowrap">
                                Done
                              </Pill>
                            )}
                            <Pill variant={PRIORITY_PILL[item.priority]} className="text-nowrap">
                              {PRIORITY_LABEL[item.priority]}
                            </Pill>
                          </div>
                        </div>
                        {isDone && !timingDetail && <div className="text-faint small mt-1">Completed</div>}
                        {timingDetail && <div className="text-faint small mt-1">{timingDetail}</div>}
                        <div className="small text-muted-2 mt-1">
                          Max streak: {realtimeStreak.highest}d · Current streak: {realtimeStreak.current}d
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>
          </div>
        </div>
      </div>
    </div>
  );
}
