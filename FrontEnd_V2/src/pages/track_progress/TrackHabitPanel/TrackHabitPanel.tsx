import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDownRight, ArrowUpRight, CheckLg, ChevronRight, DashLg, TagFill } from "react-bootstrap-icons";

import "@/pages/my_goals/GoalCreationWizard/GoalCreationWizard.scss";
import "@/pages/assistant/RefinedGoalReviewPanel/RefinedGoalReviewPanel.scss";
import "./TrackHabitPanel.scss";

import type { HabitPriority } from "@/api/types";
import { PRIORITY_LABEL } from "@/pages/plan/PlanPage.constants";

function PriorityIcon({ priority }: { priority: HabitPriority }) {
  if (priority === "highest" || priority === "high") return <ArrowUpRight size={11} />;
  if (priority === "low" || priority === "lowest") return <ArrowDownRight size={11} />;
  return <DashLg size={11} />;
}

export interface HabitListItem {
  id: number;
  title: string;
  type: "Metric" | "Simple";
  priority: HabitPriority;
  category: string | null;
  active: boolean;
}

interface TrackHabitPanelProps {
  habits: HabitListItem[];
  onClose: () => void;
  onSave: (enabledIds: Set<number>) => void;
}

const SLIDE_OUT_DURATION_MS = 220;

export function TrackHabitPanel({ habits, onClose, onSave }: TrackHabitPanelProps) {
  const [isClosing, setIsClosing] = useState(false);
  const [enabled, setEnabled] = useState<Set<number>>(() => new Set(habits.filter(h => h.active).map(h => h.id)));

  function requestClose() {
    if (isClosing) return;
    setIsClosing(true);
    window.setTimeout(onClose, SLIDE_OUT_DURATION_MS);
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClosing]);

  function toggleHabit(id: number) {
    setEnabled(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return createPortal(
    <div className="goal-refined-review-backdrop" onClick={requestClose}>
      <section
        className={`goal-refined-review-panel thp-panel${isClosing ? " is-closing" : ""}`}
        onClick={e => e.stopPropagation()}
        aria-labelledby="track-habit-panel-title"
      >
        <header className="goal-wizard-header p-0">
          <div className="goal-wizard-header-main w-100">
            <div className="goal-wizard-header-copy w-100">
              <h3
                id="track-habit-panel-title"
                className="d-flex align-items-center justify-content-between"
              >
                Track Habits
                <button
                  type="button"
                  className="btn btn-ghost btn-icon goal-wizard-close"
                  onClick={requestClose}
                  aria-label="Close panel"
                >
                  <ChevronRight size={25} />
                </button>
              </h3>
              <p>Toggle habits on or off to enable or disable tracking.</p>
            </div>
          </div>
        </header>

        <div className="thp-list">
          {habits.map(h => (
            <div key={h.id} className="thp-row" onClick={() => toggleHabit(h.id)}>
              <button
                type="button"
                className={`thp-checkbox${enabled.has(h.id) ? " thp-checkbox--on" : ""}`}
                aria-checked={enabled.has(h.id)}
                aria-label={`Toggle ${h.title}`}
                role="checkbox"
                tabIndex={-1}
              >
                {enabled.has(h.id) && <CheckLg size={10} />}
              </button>
              <div className="thp-row-body">
                <span className="thp-name">{h.title}</span>
                <div className="thp-pills">
                  {h.category && (
                    <span className="thp-pill thp-pill--category">
                      <TagFill size={10} />
                      {h.category}
                    </span>
                  )}
                  <span className={`thp-pill thp-pill--priority-${h.priority}`}>
                    <PriorityIcon priority={h.priority} />
                    {PRIORITY_LABEL[h.priority]}
                  </span>
                  <span className={`thp-pill thp-pill--${h.type.toLowerCase()}`}>{h.type}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <footer className="thp-footer">
          <button type="button" className="btn btn-primary" onClick={() => { onSave(enabled); requestClose(); }}>
            Save
          </button>
          <button type="button" className="btn btn-soft" onClick={requestClose}>
            Cancel
          </button>
        </footer>
      </section>
    </div>,
    document.body
  );
}
