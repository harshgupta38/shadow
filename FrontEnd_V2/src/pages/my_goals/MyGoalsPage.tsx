import {
  Bullseye,
  CalendarCheck,
  Check2Circle,
  Compass,
  Diagram3,
  Grid1x2,
  PauseCircle,
  PlayCircle,
  PlusLg,
  Stars,
} from "react-bootstrap-icons";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api, type GoalListItemResponse } from "@/api";
import { ApiError } from "@/api/client";
import { IllustratedErrorState } from "@/components/ui/IllustratedErrorState/IllustratedErrorState";

import { PageFooter } from "@/components/ui/PageFooter/PageFooter";
import type { PageHeaderAction } from "@/components/ui/PageHeader/PageHeader";
import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import { ROUTES } from "@/routes/RoutePaths";

import { GoalCreationWizard } from "./components/GoalCreationWizard/GoalCreationWizard";
import { GoalLoadingSkeleton } from "./components/GoalLoadingSkeleton/GoalLoadingSkeleton";
import { useToast } from "@/context/ToastContext";

import "./MyGoalsPage.scss";

type GoalFilterLabel = "All" | "Active" | "Paused" | "Completed";

type FilterData = {
  title: string;
  subtitle: string;
  points: string[];
  icon: JSX.Element;
};

const FILTER_CONTENT: Record<GoalFilterLabel, FilterData> = {
  All: {
    title: "No goals yet, but your momentum starts now.",
    subtitle: "Turn one clear ambition into milestones, daily actions, and repeatable progress.",
    points: [
      "Define where you want to be",
      "Plan what matters this week",
      "Track wins and keep consistency",
    ],
    icon: <Grid1x2 size={16} />,
  },
  Active: {
    title: "No goals yet, but your momentum starts now.",
    subtitle: "Turn one clear ambition into milestones, daily actions, and repeatable progress.",
    points: [
      "Define where you want to be",
      "Plan what matters this week",
      "Track wins and keep consistency",
    ],
    icon: <PlayCircle size={16} />,
  },
  Paused: {
    title: "No paused goals right now.",
    subtitle: "Paused goals appear here when you intentionally take a break and plan a restart.",
    points: [
      "Pause only when priorities truly shift",
      "Set a restart date to avoid drift",
      "Resume with one small action first",
    ],
    icon: <PauseCircle size={16} />,
  },
  Completed: {
    title: "No completed goals yet.",
    subtitle: "Completed goals will show here as your proof of progress and consistency.",
    points: [
      "Finish one milestone at a time",
      "Celebrate each completed goal",
      "Use wins to plan your next level",
    ],
    icon: <Check2Circle size={16} />,
  },
};

export function MyGoalsPage() {
  const toast = useToast();
  const [activeFilter, setActiveFilter] = useState<GoalFilterLabel>("Active");
  const [goalWizardOpen, setGoalWizardOpen] = useState(false);
  const [goals, setGoals] = useState<GoalListItemResponse[]>([]);
  const [loadingGoals, setLoadingGoals] = useState(false);
  const [goalsError, setGoalsError] = useState<string | null>(null);
  const currentContent = FILTER_CONTENT[activeFilter];

  const loadGoals = useCallback(async (status: GoalFilterLabel) => {
    setLoadingGoals(true);
    setGoalsError(null);

    try {
      const response = await api.goals.getList(status);
      setGoals(response);
    } catch (error) {
      if (error instanceof ApiError) {
        setGoalsError(error.message);
      } else {
        setGoalsError("Could not load goals right now. Please try again.");
      }
      setGoals([]);
    } finally {
      setLoadingGoals(false);
    }
  }, []);

  useEffect(() => {
    void loadGoals(activeFilter);
  }, [activeFilter, loadGoals]);

  function formatGoalDate(value: string): string {
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) {
      return value;
    }

    return new Date(parsed).toLocaleDateString();
  }

  const showGoalCards = goals.length > 0;
  const showHeaderActions = !loadingGoals && showGoalCards;

  if (goalWizardOpen) {
    return (
      <section className="my-goals-page">
        <GoalCreationWizard
          open={goalWizardOpen}
          onClose={() => setGoalWizardOpen(false)}
          onSubmitted={async () => {
            await loadGoals(activeFilter);
            toast.success("Goal created successfully.");
          }}
        />
      </section>
    );
  }

  const headerActions: PageHeaderAction[] = showHeaderActions
    ? [
        {
          key: "new-goal",
          label: "New Goal",
          icon: <PlusLg size={16} />,
          desktopTone: "brand",
          mobileTone: "none",
          className: "goals-vision-cta",
          onClick: () => setGoalWizardOpen(true),
        },
        {
          key: "goal-coach",
          label: "Ask Goal Coach",
          icon: <Stars size={16} />,
          tone: "soft",
          className: "goals-vision-cta goals-vision-coach-btn",
        },
      ]
    : [];

  return (
    <section className="my-goals-page">
      <PageHeader
        title="Goals"
        subtitle="Your ambitions, broken into milestones you can move on."
        icon={<Bullseye size={20} />}
        actions={headerActions}
      />

      <div className="d-none d-lg-flex flex-wrap align-items-center gap-2 mb-4">
        <div className="nav-tabs-jv" role="tablist" aria-label="Goal filters">
          {(Object.entries(FILTER_CONTENT) as Array<[GoalFilterLabel, FilterData]>).map(([label]) => {
            const isActive = activeFilter === label;

            return (
              <button
                key={label}
                type="button"
                className={`nav-tab-jv ${isActive ? "active" : ""}`}
                aria-selected={isActive}
                onClick={() => setActiveFilter(label)}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {loadingGoals ? (
        <GoalLoadingSkeleton count={2} />
      ) : null}

      {!loadingGoals && goalsError ? (
        <IllustratedErrorState onRetry={() => void loadGoals(activeFilter)} />
      ) : null}

      {!loadingGoals && !goalsError && showGoalCards ? (
        <div className="row g-3 my-goals-grid">
          {goals.map((goal, index) => (
            <div className="col-md-6 col-xl-4" key={`${goal.title}-${goal.target_date}-${index}`}>
              <Link to={ROUTES.MY_GOAL_DETAIL.replace(":goalId", String(goal.id))} className="goal-summary-card-link">
                <article className="surface goal-summary-card h-100">
                  <div className="goal-summary-card-head">
                    <span className="goal-summary-category">{goal.category}</span>
                    <span className={`goal-summary-status goal-summary-status-${goal.status.toLowerCase()}`}>{goal.status}</span>
                  </div>

                  <h3 className="goal-summary-title">{goal.title}</h3>
                  <p className="goal-summary-text">{goal.summary}</p>

                  <div className="goal-summary-progress-row">
                    <span>Progress</span>
                    <strong>{goal.progress_percent}%</strong>
                  </div>
                  <div className="progress goal-progress-track mb-3" style={{ height: 7 }}>
                    <div className="progress-bar" style={{ width: `${goal.progress_percent}%` }} />
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
                      <CalendarCheck size={13} /> {formatGoalDate(goal.target_date)}
                    </span>
                  </div>
                </article>
              </Link>
            </div>
          ))}
        </div>
      ) : null}

      {!loadingGoals && !goalsError && !showGoalCards ? (
        <div className="surface goals-vision">
          <h2 className="goals-vision-title">{currentContent.title}</h2>
          <p className="goals-vision-subtitle">{currentContent.subtitle}</p>

          <div className="goals-vision-points">
            <div className="goals-point">
              <Compass size={16} />
              <span>{currentContent.points[0]}</span>
            </div>
            <div className="goals-point">
              <CalendarCheck size={16} />
              <span>{currentContent.points[1]}</span>
            </div>
            <div className="goals-point">
              <Check2Circle size={16} />
              <span>{currentContent.points[2]}</span>
            </div>
          </div>

          <div className="d-flex flex-wrap gap-2 goals-vision-actions">
            <button type="button" className="btn btn-brand goals-vision-cta" onClick={() => setGoalWizardOpen(true)}>
              <PlusLg size={16} className="me-1" /> New Goal
            </button>
            <button type="button" className="btn btn-soft goals-vision-cta goals-vision-coach-btn">
              <Stars size={16} className="me-1" /> Ask Goal Coach
            </button>
          </div>
        </div>
      ) : null}

      <PageFooter
        ariaLabel="Goals quick actions"
        actions={(Object.entries(FILTER_CONTENT) as Array<[GoalFilterLabel, FilterData]>).map(
          ([label, data]) => ({
            key: label.toLowerCase(),
            label,
            icon: data.icon,
            isActive: activeFilter === label,
            onClick: () => setActiveFilter(label),
          }),
        )}
      />
    </section>
  );
}