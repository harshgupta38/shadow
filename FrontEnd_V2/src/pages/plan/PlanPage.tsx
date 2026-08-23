import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Calendar3,
  CalendarCheckFill,
  ChevronLeft,
  ChevronRight,
  Clock,
  ListTask,
  Plus,
} from "react-bootstrap-icons";

import { api, ApiError } from "@/api";
import type { PlanResponse, PlanItemPriority } from "@/api";
import { ROUTES } from "@/routes/RoutePaths";
import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import { ProgressRing } from "@/components/ui/ProgressRing/ProgressRing";
import "@/pages/plan/PlanPage.scss";

const TODAY = new Date();

const PRIORITY_LABEL: Record<PlanItemPriority, string> = {
  highest: "Highest",
  high: "High",
  medium: "Medium",
  low: "Low",
  lowest: "Lowest",
};

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function shiftDate(date: Date, days: number): Date {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}

function formatDuration(minutes: number): string {
  if (minutes === 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function PlanPage() {
  const navigate = useNavigate();

  const [selectedDate, setSelectedDate] = useState(TODAY);
  const [planData, setPlanData] = useState<PlanResponse | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  const isToday = selectedDate.toDateString() === TODAY.toDateString();

  const loadPlan = useCallback(async () => {
    setLoadingPlan(true);
    setPlanError(null);
    try {
      const response = await api.planItems.getToday(toDateInputValue(selectedDate));
      setPlanData(response);
    } catch (err) {
      setPlanError(err instanceof ApiError ? err.message : "Couldn't load the plan.");
      setPlanData(null);
    } finally {
      setLoadingPlan(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    void loadPlan();
  }, [loadPlan]);

  const planItems = planData?.items ?? [];

  const doneCount = useMemo(
    () => planItems.filter((item) => item.status === "done").length,
    [planItems],
  );
  const totalCount = planItems.length;
  const completion = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  const estimatedMinutes = useMemo(
    () => planItems.reduce((sum, item) => sum + (item.duration_minutes ?? 0), 0),
    [planItems],
  );

  const activeItems = useMemo(
    () => planItems.filter((item) => item.status !== "done"),
    [planItems],
  );
  const doneItems = useMemo(
    () => planItems.filter((item) => item.status === "done"),
    [planItems],
  );

  const progressMessage =
    totalCount === 0
      ? "Plan a few tasks to get started."
      : completion === 100
        ? "Everything done — nice work!"
        : "Keep going, you've got this.";


  return (
    <section className="plan-page">
      <PageHeader
        title="Today's plan"
        subtitle="A short, honest list beats a long one. Plan it, then do it."
        icon={<CalendarCheckFill size={18} />}
      />

      <div className="plan-actions">
        <div className="date-controls" aria-label="Choose plan date">
          <button type="button" className="plan-icon-button" aria-label="Previous day" onClick={() => setSelectedDate((date) => shiftDate(date, -1))}>
            <ChevronLeft size={18} />
          </button>
          <label className="date-field">
            <span className="visually-hidden">Plan date</span>
            <span className="date-display" aria-hidden="true">{formatDisplayDate(selectedDate)}</span>
            <Calendar3 className="date-calendar-icon" size={16} aria-hidden="true" />
            <input
              type="date"
              value={toDateInputValue(selectedDate)}
              onChange={(event) => setSelectedDate(new Date(`${event.target.value}T00:00:00`))}
              aria-label="Plan date"
            />
          </label>
          <button type="button" className="plan-icon-button" aria-label="Next day" onClick={() => setSelectedDate((date) => shiftDate(date, 1))}>
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="plan-action-buttons">
          <button type="button" className="plan-secondary-button" onClick={() => navigate(ROUTES.SCHEDULE)}>
            <Plus size={16} /> Schedule
          </button>
          <button type="button" className="plan-primary-button" onClick={() => setSelectedDate(TODAY)}>
            <CalendarCheckFill size={15} /> {isToday ? "Today's Plan" : "Today"}
          </button>
        </div>
      </div>

      <div className="plan-columns">
        <div className="plan-column">
          <section className="plan-panel insights-panel">
            <div className="panel-heading">
              <h2>Daily insights</h2>
              <p>What Shadow noticed for this date.</p>
            </div>
            <div className="insight-stats">
              <div className="insight-item">
                <span>Missed yesterday</span>
                <strong>{loadingPlan ? "---" : (planData?.missed_yesterday_count ?? "---")}</strong>
              </div>
              <div className="insight-item">
                <span>Carry forward</span>
                <strong>{loadingPlan ? "---" : (planData?.carry_forward_count ?? "---")}</strong>
              </div>
              <div className="insight-item">
                <span>Workload</span>
                <strong>{loadingPlan ? "---" : (planData?.workload_label ?? "---")}</strong>
              </div>
              {estimatedMinutes > 0 && (
                <div className="insight-item">
                  <span>Estimated time</span>
                  <strong>{loadingPlan ? "---" : formatDuration(estimatedMinutes)}</strong>
                </div>
              )}
            </div>
          </section>

          <section className="plan-panel today-panel">
            <h2>{isToday ? "Today" : formatDisplayDate(selectedDate)}</h2>

            {loadingPlan ? (
              <div className="empty-state">
                <h3 className="text-normal">Loading...</h3>
              </div>
            ) : planError ? (
              <div className="empty-state">
                <span className="empty-state-icon"><CalendarCheckFill size={20} /></span>
                <h3 className="text-normal">Couldn't load your plan</h3>
                <p>{planError}</p>
              </div>
            ) : totalCount === 0 ? (
              <div className="empty-state">
                <span className="empty-state-icon"><CalendarCheckFill size={20} /></span>
                <h3 className="text-normal">{isToday ? "No plans for today" : "Nothing was planned for this date."}</h3>
                <p>
                  {isToday ?
                    "You're all clear. Enjoy the day or add something manually."
                    : "You can add something manually or check another date."
                  }
                </p>
              </div>
            ) : (
              <div className="plan-task-list">
                {activeItems.map((item) => (
                  <div key={item.id} className="plan-task-item">
                    <span className="plan-task-title">{item.title}</span>
                    <span className={`plan-task-priority plan-task-priority--${item.priority}`}>
                      {PRIORITY_LABEL[item.priority]}
                    </span>
                  </div>
                ))}
                {doneItems.length > 0 && (
                  <>
                    <div className="plan-task-section-label">Completed</div>
                    {doneItems.map((item) => (
                      <div key={item.id} className="plan-task-item plan-task-item--done">
                        <span className="plan-task-title">{item.title}</span>
                        <span className="plan-task-badge plan-task-badge--done">Done</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </section>
        </div>

        <div className="plan-column">
          {totalCount > 0 && (
            <section className="plan-panel progress-panel">
              <ProgressRing percentage={completion} />
              <h2>{doneCount} of {totalCount} done</h2>
              <p>{progressMessage}</p>
            </section>
          )}

          <section className="plan-panel summary-panel">
            <div className="summary-heading">
              <div>
                <h2>Today's plan summary</h2>
                <p>A quick snapshot of planned items and timing<br />for today.</p>
              </div>
              <ListTask size={17} />
            </div>
            <div className="empty-state summary-empty-state">
              <span className="empty-state-icon"><Clock size={20} /></span>
              <h3 className="text-normal">No plan summary yet</h3>
              <p>Generate a plan to see today's planned<br />items and timing.</p>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}