import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight } from "react-bootstrap-icons";

import "@/pages/my_goals/GoalCreationWizard/GoalCreationWizard.scss";
import "@/pages/assistant/RefinedGoalReviewPanel/RefinedGoalReviewPanel.scss";
import "./HabitTaskSwitcherPanel.scss";

import type { HabitPriority } from "@/api/types";
import { PRIORITY_LABEL } from "@/pages/plan/PlanPage.constants";
import { PriorityIcon } from "@/constant/priority";
import { ANIMATION } from "@/constant/tuning";

export interface HabitSwitchItem {
  id: number;
  title: string;
  type: "Metric" | "Simple";
  priority: HabitPriority;
  category: string | null;
}

export interface TaskSwitchItem {
  id: number;
  title: string;
  type: "Metric" | "Simple";
  priority: HabitPriority;
}

interface HabitTaskSwitcherPanelProps {
  habits: HabitSwitchItem[];
  tasks: TaskSwitchItem[];
  activeHabitId?: number;
  activeTaskId?: number;
  onClose: () => void;
  onSelectHabit: (id: number) => void;
  onSelectTask: (id: number) => void;
}

export function HabitTaskSwitcherPanel({
  habits,
  tasks,
  activeHabitId,
  activeTaskId,
  onClose,
  onSelectHabit,
  onSelectTask,
}: HabitTaskSwitcherPanelProps) {
  const [isClosing, setIsClosing] = useState(false);

  function requestClose() {
    if (isClosing) return;
    setIsClosing(true);
    window.setTimeout(onClose, ANIMATION.PANEL_SLIDE_OUT_MS);
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClosing]);

  function selectHabit(id: number) {
    if (id === activeHabitId) { requestClose(); return; }
    onSelectHabit(id);
    requestClose();
  }

  function selectTask(id: number) {
    if (id === activeTaskId) { requestClose(); return; }
    onSelectTask(id);
    requestClose();
  }

  return createPortal(
    <div className="goal-refined-review-backdrop" onClick={requestClose}>
      <section
        className={`goal-refined-review-panel htsp-panel${isClosing ? " is-closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
        aria-labelledby="habit-task-switcher-title"
      >
        <header className="goal-wizard-header p-0">
          <div className="goal-wizard-header-main w-100">
            <div className="goal-wizard-header-copy w-100">
              <h3
                id="habit-task-switcher-title"
                className="d-flex align-items-center justify-content-between"
              >
                Switch habit or task
                <button
                  type="button"
                  className="btn btn-ghost btn-icon goal-wizard-close"
                  onClick={requestClose}
                  aria-label="Close panel"
                >
                  <ChevronRight size={25} />
                </button>
              </h3>
              <p>Jump straight to another item without leaving this page.</p>
            </div>
          </div>
        </header>

        <div className="htsp-list">

          {/* ── Habits ── */}
          {habits.length > 0 && (
            <div className="htsp-divider">
              <span className="htsp-section-label">Habits</span>
              <span className="htsp-section-chip">{habits.length}</span>
            </div>
          )}
          {habits.map((h) => {
            const isActive = h.id === activeHabitId;
            return (
              <div
                key={h.id}
                className={`htsp-row${isActive ? " htsp-row--active" : ""}`}
                onClick={() => selectHabit(h.id)}
                aria-current={isActive || undefined}
              >
                <div className="htsp-row-body">
                  <span className="htsp-name">{h.title}</span>
                  <div className="htsp-pills">
                    <span className={`htsp-pill htsp-pill--priority-${h.priority}`}>
                      <PriorityIcon priority={h.priority} />
                      {PRIORITY_LABEL[h.priority]}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* ── Tasks ── */}
          {tasks.length > 0 && (
            <div className="htsp-divider">
              <span className="htsp-section-label">Tasks</span>
              <span className="htsp-section-chip">{tasks.length}</span>
            </div>
          )}
          {tasks.map((t) => {
            const isActive = t.id === activeTaskId;
            return (
              <div
                key={t.id}
                className={`htsp-row${isActive ? " htsp-row--active" : ""}`}
                onClick={() => selectTask(t.id)}
                aria-current={isActive || undefined}
              >
                <div className="htsp-row-body">
                  <span className="htsp-name">{t.title}</span>
                  <div className="htsp-pills">
                    <span className={`htsp-pill htsp-pill--priority-${t.priority}`}>
                      <PriorityIcon priority={t.priority} />
                      {PRIORITY_LABEL[t.priority]}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}

          {habits.length === 0 && tasks.length === 0 && (
            <div className="htsp-empty">No other active habits or tasks to switch to.</div>
          )}

        </div>
      </section>
    </div>,
    document.body,
  );
}
