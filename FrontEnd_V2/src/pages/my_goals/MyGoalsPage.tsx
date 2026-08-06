import {
  Bullseye,
  CalendarCheck,
  Check2Circle,
  Compass,
  Grid1x2,
  PauseCircle,
  PlayCircle,
  PlusLg,
  Stars,
} from "react-bootstrap-icons";
import { useState } from "react";

import { PageFooter } from "@/components/ui/PageFooter/PageFooter";
import type { PageHeaderAction } from "@/components/ui/PageHeader/PageHeader";
import { PageHeader } from "@/components/ui/PageHeader/PageHeader";

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
  const [activeFilter, setActiveFilter] = useState<GoalFilterLabel>("All");
  const currentContent = FILTER_CONTENT[activeFilter];

  const headerActions: PageHeaderAction[] = [
    {
      key: "new-goal",
      label: "New Goal",
      icon: <PlusLg size={16} />,
      desktopTone: "brand",
      mobileTone: "none",
      className: "goals-vision-cta",
    },
    {
      key: "goal-coach",
      label: "Ask Goal Coach",
      icon: <Stars size={16} />,
      tone: "soft",
      className: "goals-vision-cta goals-vision-coach-btn",
    },
  ];

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
          <button type="button" className="btn btn-brand goals-vision-cta">
            <PlusLg size={16} className="me-1" /> New Goal
          </button>
          <button type="button" className="btn btn-soft goals-vision-cta goals-vision-coach-btn">
            <Stars size={16} className="me-1" /> Ask Goal Coach
          </button>
        </div>
      </div>

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