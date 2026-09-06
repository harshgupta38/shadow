import {
  Bullseye,
  Check2Circle,
  Grid1x2,
  PauseCircle,
  PlayCircle,
  PlusLg,
  Stars,
  CalendarCheck,
  Compass,
} from "react-bootstrap-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";

import { api, type GoalDataShortResponse } from "@/api";
import { ApiError } from "@/api/client";
import { IllustratedErrorState } from "@/components/ui/IllustratedErrorState/IllustratedErrorState";

import { PageFooter } from "@/components/ui/PageFooter/PageFooter";
import type { PageHeaderAction } from "@/components/ui/PageHeader/PageHeader";
import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import { ROUTES } from "@/routes/RoutePaths";

import { GoalCard } from "@/pages/my_goals/GoalCard/GoalCard";
import { GoalCreationWizard } from "@/pages/my_goals/GoalCreationWizard/GoalCreationWizard";
import { GoalLoadingSkeleton } from "@/pages/my_goals/GoalLoadingSkeleton/GoalLoadingSkeleton";
import { useToast } from "@/context/ToastContext";

import "@/pages/my_goals/MyGoalsPage.scss";

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
  const navigate = useNavigate();

  const [activeFilter, setActiveFilter] = useState<GoalFilterLabel>("Active");
  const [goalWizardOpen, setGoalWizardOpen] = useState(false);
  const [goals, setGoals] = useState<GoalDataShortResponse[]>([]);
  const [loadingGoals, setLoadingGoals] = useState(false);
  const [goalsError, setGoalsError] = useState<string | null>(null);
  const currentContent = FILTER_CONTENT[activeFilter];

  // Keep a snapshot to revert to if the reorder API call fails
  const goalsSnapshot = useRef<GoalDataShortResponse[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

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

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = goals.findIndex((g) => g.id === active.id);
    const newIndex = goals.findIndex((g) => g.id === over.id);
    const reordered = arrayMove(goals, oldIndex, newIndex);

    goalsSnapshot.current = goals;
    setGoals(reordered);

    try {
      await api.goals.reorderGoals({
        goals: reordered.map((g, i) => ({ id: g.id, position: i })),
      });
    } catch {
      setGoals(goalsSnapshot.current);
      toast.error("Could not save the new order. Please try again.");
    }
  }

  const showGoalCards = goals.length > 0;
  const showHeaderActions = !loadingGoals && showGoalCards;

  function openGoalCoach() {
    navigate(ROUTES.ASSISTANT, {
      state: { agentType: "goal_coach", autoMessage: "I want to create a new goal" },
    });
  }

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
        onClick: openGoalCoach,
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
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <SortableContext items={goals.map((g) => g.id)} strategy={rectSortingStrategy}>
            <div className="row g-3 my-goals-grid">
              {goals.map((goal) => (
                <GoalCard key={goal.id} goal={goal} dragDisabled={activeFilter !== "All"} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
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
            <button type="button" className="btn btn-soft goals-vision-cta goals-vision-coach-btn" onClick={openGoalCoach}>
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