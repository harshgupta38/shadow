import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BellFill,
  Bullseye,
  CalendarCheckFill,
  CheckLg,
  Fire,
  GraphUpArrow,
  PlusLg,
} from "react-bootstrap-icons";

import { api, type MetricSummary, type PlannedTask } from "@/api";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatCard } from "@/components/ui/StatCard";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { useAsync } from "@/hooks/useAsync";
import { clampPercent, formatMetricValue, greeting, relativeTime, toISODate } from "@/lib/format";

type PillVariant = "success" | "warn" | "danger" | "info" | "brand" | "muted";

const TASK_PRIORITY_LABEL: Record<PlannedTask["priority"], string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const TASK_PRIORITY_PILL: Record<PlannedTask["priority"], PillVariant> = {
  critical: "danger",
  high: "warn",
  medium: "info",
  low: "muted",
};

function MetricMiniCard({ metric }: { metric: MetricSummary }) {
  const targetPct = metric.target ? clampPercent((metric.today_total / metric.target) * 100) : null;
  return (
    <div className="surface-2 p-3 h-100">
      <div className="d-flex align-items-start justify-content-between gap-2 mb-2">
        <span className="fw-semibold small text-truncate">{metric.label}</span>
        {metric.streak_days > 0 && (
          <Pill variant="warn" className="flex-shrink-0">
            <Fire size={12} /> {metric.streak_days}
          </Pill>
        )}
      </div>
      <div className="d-flex align-items-end justify-content-between">
        <div>
          <div className="fw-display fw-bold" style={{ fontSize: "1.5rem", lineHeight: 1 }}>
            {formatMetricValue(metric.today_total, metric.unit)}
          </div>
          <div className="text-faint" style={{ fontSize: "0.72rem" }}>
            today · {formatMetricValue(metric.week_total, metric.unit)} this week
          </div>
        </div>
        {targetPct !== null && (
          <ProgressRing value={targetPct} size={46} stroke={5} showLabel={false} />
        )}
      </div>
      {metric.target != null && (
        <div className="text-faint mt-2" style={{ fontSize: "0.72rem" }}>
          Target: {formatMetricValue(metric.target, metric.unit)}
        </div>
      )}
    </div>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { data, loading, error, reload, setData } = useAsync(
    () => api.dashboard.summary(),
    [],
  );

  const bestStreak = useMemo(
    () => (data ? data.metrics.reduce((max, m) => Math.max(max, m.streak_days), 0) : 0),
    [data],
  );

  const goalTitleById = useMemo(
    () => new Map((data?.active_goals ?? []).map((goal) => [goal.id, goal.title])),
    [data?.active_goals],
  );

  const completionRate = data && data.tasks_today_total > 0
    ? clampPercent((data.tasks_today_done / data.tasks_today_total) * 100)
    : 0;

  async function toggleTask(task: PlannedTask) {
    const nextStatus = task.status === "done" ? "planned" : "done";
    const isToday = task.date === toISODate();
    setData((prev) =>
      prev
        ? {
            ...prev,
            upcoming_tasks: prev.upcoming_tasks.map((t) =>
              t.id === task.id ? { ...t, status: nextStatus } : t,
            ),
            tasks_today_done: isToday
              ? Math.max(0, prev.tasks_today_done + (nextStatus === "done" ? 1 : -1))
              : prev.tasks_today_done,
          }
        : prev,
    );
    try {
      await api.plan.update(task.id, { status: nextStatus });
    } catch {
      toast.error("Couldn't update the task.");
      reload();
    }
  }

  async function dismissNotification(id: number) {
    setData((prev) =>
      prev
        ? { ...prev, unread_notifications: prev.unread_notifications.filter((n) => n.id !== id) }
        : prev,
    );
    try {
      await api.notifications.markRead(id);
    } catch {
      /* non-critical */
    }
  }

  if (loading) return <LoadingState label="Loading your dashboard…" />;

  if (error || !data) {
    return (
      <EmptyState
        icon={<GraphUpArrow size={26} />}
        title="Couldn't load your dashboard"
        message={error ?? "Please try again."}
        action={
          <button className="btn btn-brand" onClick={reload}>
            Retry
          </button>
        }
      />
    );
  }

  const firstName = user?.name?.split(" ")[0] ?? "there";

  return (
    <div>
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        subtitle="Here's your momentum today. Small steps add up."
        actions={
          <>
            <Link to="/plan" className="btn btn-outline-secondary">
              <PlusLg size={16} className="me-1" /> Plan today
            </Link>
            <Link to="/reports" className="btn btn-brand">
              View reports
            </Link>
          </>
        }
      />

      {/* Stat cards */}
      <div className="row g-3 mb-4">
        <div className="col-6 col-lg-3">
          <StatCard
            label="Tasks done today"
            value={`${data.tasks_today_done}/${data.tasks_today_total}`}
            icon={<CalendarCheckFill size={20} />}
            visual={<ProgressRing value={completionRate} size={58} stroke={6} />}
          />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard
            label="Active goals"
            value={data.goals_active}
            icon={<Bullseye size={20} />}
            hint={`${data.goals_completed} completed`}
            accent="#4f8bff"
          />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard
            label="Average progress"
            value={`${Math.round(data.average_progress)}%`}
            icon={<GraphUpArrow size={20} />}
            accent="#16a97a"
          />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard
            label="Best streak"
            value={bestStreak}
            icon={<Fire size={20} />}
            hint={bestStreak > 0 ? "Keep it going!" : "Log activity to start"}
            accent="#e0913a"
          />
        </div>
      </div>

      <div className="row g-4">
        <div className="col-lg-8 d-flex flex-column gap-4">
          {/* Metrics */}
          <SectionCard
            title="Your metrics"
            subtitle="What you measured today"
            actions={
              <Link to="/track" className="btn btn-ghost btn-sm">
                Track <ArrowRight size={14} className="ms-1" />
              </Link>
            }
          >
            {data.metrics.length === 0 ? (
              <EmptyState
                compact
                icon={<GraphUpArrow size={22} />}
                title="No metrics yet"
                message="Add a metric like deep-work minutes or problems solved to start tracking."
                action={
                  <Link to="/track" className="btn btn-soft btn-sm">
                    Set up metrics
                  </Link>
                }
              />
            ) : (
              <div className="row g-3">
                {data.metrics.slice(0, 4).map((metric) => (
                  <div className="col-sm-6" key={metric.metric_id}>
                    <MetricMiniCard metric={metric} />
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Active goals */}
          <SectionCard
            title="Active goals"
            subtitle="Where you're heading"
            actions={
              <Link to="/goals" className="btn btn-ghost btn-sm">
                All goals <ArrowRight size={14} className="ms-1" />
              </Link>
            }
          >
            {data.active_goals.length === 0 ? (
              <EmptyState
                compact
                icon={<Bullseye size={22} />}
                title="No active goals"
                message="Set your first goal and Shadow will help you break it into milestones."
                action={
                  <Link to="/goals" className="btn btn-soft btn-sm">
                    Create a goal
                  </Link>
                }
              />
            ) : (
              <div className="d-flex flex-column">
                {data.active_goals.slice(0, 4).map((goal, i) => {
                  const doneCount = goal.milestones.filter((m) => m.status === "done").length;
                  return (
                    <Link
                      to={`/goals/${goal.id}`}
                      key={goal.id}
                      className={`d-flex align-items-center gap-3 py-3 text-body clickable ${
                        i > 0 ? "border-top" : ""
                      }`}
                      style={{ borderColor: "var(--jv-border)" }}
                    >
                      <ProgressRing value={goal.progress} size={52} stroke={6} />
                      <div className="flex-grow-1 min-w-0">
                        <div className="fw-semibold text-truncate">{goal.title}</div>
                        <div className="d-flex align-items-center gap-2 mt-1">
                          {goal.category && (
                            <Pill variant="brand">{goal.category}</Pill>
                          )}
                          {goal.milestones.length > 0 && (
                            <span className="text-faint small">
                              {doneCount}/{goal.milestones.length} milestones
                            </span>
                          )}
                        </div>
                      </div>
                      <ArrowRight size={16} className="text-faint flex-shrink-0" />
                    </Link>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>

        {/* Right column */}
        <div className="col-lg-4 d-flex flex-column gap-4">
          <SectionCard
            title="Today's plan"
            actions={
              <Link to="/plan" className="btn btn-ghost btn-sm">
                Open
              </Link>
            }
          >
            {data.upcoming_tasks.length === 0 ? (
              <EmptyState
                compact
                icon={<CalendarCheckFill size={22} />}
                title="Nothing planned yet"
                message="Plan a few tasks to build momentum today."
                action={
                  <button className="btn btn-soft btn-sm" onClick={() => navigate("/plan")}>
                    Plan today
                  </button>
                }
              />
            ) : (
              <div className="d-flex flex-column">
                {data.upcoming_tasks.slice(0, 6).map((task) => {
                  const done = task.status === "done";
                  const linkedGoal =
                    (task.related_goal_id ? goalTitleById.get(task.related_goal_id) : null)
                    ?? task.goal_title
                    ?? "Not linked to a goal";
                  const category =
                    typeof task.category === "string" && task.category.trim().length > 0
                      ? task.category
                      : "Uncategorized";
                  const currentStreak = Math.max(0, task.current_habit_streak ?? 0);

                  return (
                    <div key={task.id} className="surface-2 p-3 p-sm-4 mb-2">
                      <div className="d-flex align-items-start gap-3">
                        <button
                          type="button"
                          className="btn p-0 flex-shrink-0"
                          onClick={() => void toggleTask(task)}
                          aria-label={done ? "Mark as not done" : "Mark as done"}
                          title={done ? "Mark as not done" : "Mark as done"}
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: "50%",
                            display: "grid",
                            placeItems: "center",
                            background: done ? "var(--jv-brand-gradient)" : "transparent",
                            border: done ? "none" : "2px solid var(--jv-brand-1)",
                            color: "#fff",
                            transition: "all 160ms ease",
                          }}
                        >
                          {done && <CheckLg size={14} />}
                        </button>

                        <div className="flex-grow-1 min-w-0">
                          <div className={`fw-semibold text-truncate ${done ? "text-muted-2" : ""}`}>
                            {task.title}
                          </div>

                          <div className="d-flex align-items-center gap-2 mt-2 flex-wrap">
                            <Pill variant="brand">{category}</Pill>
                            <Pill variant={TASK_PRIORITY_PILL[task.priority]}>
                              {TASK_PRIORITY_LABEL[task.priority]}
                            </Pill>
                          </div>

                          <div className="small text-muted-2 mt-2">
                            <span className="fw-semibold">Streak:</span> {currentStreak}d
                          </div>
                          <div className="small text-muted-2 mt-1">
                            <span className="fw-semibold">Goal:</span> {linkedGoal}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>

          {data.unread_notifications.length > 0 && (
            <SectionCard
              title="From Shadow"
              actions={
                <Link to="/notifications" className="btn btn-ghost btn-sm">
                  All
                </Link>
              }
            >
              <div className="d-flex flex-column gap-2">
                {data.unread_notifications.slice(0, 4).map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className="surface-2 p-3 text-start border-0 w-100 clickable"
                    onClick={() => dismissNotification(n.id)}
                  >
                    <div className="d-flex gap-2">
                      <BellFill size={15} className="mt-1 flex-shrink-0" style={{ color: "var(--jv-brand-1)" }} />
                      <div className="min-w-0">
                        <div className="fw-semibold small">{n.title}</div>
                        {n.body && <div className="text-muted-2 small line-clamp-2">{n.body}</div>}
                        <div className="text-faint mt-1" style={{ fontSize: "0.7rem" }}>
                          {relativeTime(n.created_at)} · tap to dismiss
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}
