import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bullseye, PlusLg, Stars } from "react-bootstrap-icons";

import { api, type Goal, type GoalStatus } from "@/api";
import { GoalCard } from "@/components/goals/GoalCard";
import { GoalFormModal } from "@/components/goals/GoalFormModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAsync } from "@/hooks/useAsync";

type Filter = GoalStatus | "all";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
];

function dueDateTimestamp(goal: Goal): number | null {
  if (!goal.target_date) return null;
  const parsed = Date.parse(goal.target_date);
  return Number.isNaN(parsed) ? null : parsed;
}

function compareGoalsByDueDate(a: Goal, b: Goal): number {
  const aDue = dueDateTimestamp(a);
  const bDue = dueDateTimestamp(b);

  if (aDue === null && bDue !== null) return 1;
  if (aDue !== null && bDue === null) return -1;
  if (aDue !== null && bDue !== null && aDue !== bDue) return aDue - bDue;

  const aCreatedAt = Date.parse(a.created_at);
  const bCreatedAt = Date.parse(b.created_at);
  if (!Number.isNaN(aCreatedAt) && !Number.isNaN(bCreatedAt) && aCreatedAt !== bCreatedAt) {
    return bCreatedAt - aCreatedAt;
  }

  return a.id - b.id;
}

export function GoalsPage() {
  const { data, loading, error, reload, setData } = useAsync(() => api.goals.list(), []);
  const [filter, setFilter] = useState<Filter>("all");
  const [showModal, setShowModal] = useState(false);

  const goals = data ?? [];
  const filtered = useMemo(() => {
    const visible = filter === "all" ? goals : goals.filter((g) => g.status === filter);
    return [...visible].sort(compareGoalsByDueDate);
  }, [goals, filter]);

  function handleCreated(goal: Goal) {
    setData((prev) => [goal, ...(prev ?? [])]);
  }

  return (
    <div>
      <PageHeader
        title="Goals"
        subtitle="Your ambitions, broken into milestones you can move on."
        icon={<Bullseye size={20} />}
        actions={
          <button className="btn btn-brand" onClick={() => setShowModal(true)}>
            <PlusLg size={16} className="me-1" /> New goal
          </button>
        }
      />

      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-4">
        <div className="nav-tabs-jv">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`nav-tab-jv ${filter === f.value ? "active" : ""}`}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
              {f.value !== "all" && (
                <span className="ms-1 text-faint">
                  {goals.filter((g) => g.status === f.value).length}
                </span>
              )}
            </button>
          ))}
        </div>
        <Link to="/assistant?agent=general&goalDiscovery=1" className="btn btn-soft btn-sm">
          <Stars size={14} className="me-1" /> Ask Shadow
        </Link>
      </div>

      {loading && <LoadingState label="Loading your goals…" />}

      {error && !loading && (
        <EmptyState
          icon={<Bullseye size={26} />}
          title="Couldn't load goals"
          message={error}
          action={
            <button className="btn btn-brand" onClick={reload}>
              Retry
            </button>
          }
        />
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="surface">
          <EmptyState
            icon={<Bullseye size={26} />}
            title={filter === "all" ? "No goals yet" : `No ${filter} goals`}
            message={
              filter === "all"
                ? "Create your first goal and Shadow will help you turn it into a clear plan."
                : "Try a different filter, or create a new goal."
            }
            action={
              <button className="btn btn-brand" onClick={() => setShowModal(true)}>
                <PlusLg size={16} className="me-1" /> New goal
              </button>
            }
          />
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="row g-3">
          {filtered.map((goal) => (
            <div className="col-md-6 col-xl-4" key={goal.id}>
              <GoalCard goal={goal} />
            </div>
          ))}
        </div>
      )}

      <GoalFormModal
        show={showModal}
        onClose={() => setShowModal(false)}
        onSaved={handleCreated}
      />
    </div>
  );
}
