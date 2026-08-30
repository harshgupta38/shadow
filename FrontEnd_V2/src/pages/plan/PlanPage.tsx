import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Calendar3,
  CalendarCheckFill,
  ChevronLeft,
  ChevronRight,
  Plus,
} from "react-bootstrap-icons";

import { api, ApiError } from "@/api";
import type { DailyPlanSavedData, PlanResponse } from "@/api";
import { ROUTES } from "@/routes/RoutePaths";
import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import { ProgressRing } from "@/components/ui/ProgressRing/ProgressRing";
import {
  toDateInputValue,
  formatDisplayDate,
  shiftDate,
} from "@/pages/plan/PlanPage.constants";
import { PlanCard } from "@/pages/plan/PlanCard/PlanCard";
import { DayOverviewPanel } from "@/pages/plan/DayOverviewPanel/DayOverviewPanel";
import { useToast } from "@/context/ToastContext";
import "@/pages/plan/PlanPage.scss";

const TODAY = new Date();
const COMPLETE_ANIM_MS = 520;

export function PlanPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [selectedDate, setSelectedDate] = useState(TODAY);
  const [planData, setPlanData] = useState<PlanResponse | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [completingIds, setCompletingIds] = useState<Set<number>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());

  const isToday = selectedDate.toDateString() === TODAY.toDateString();

  const loadPlan = useCallback(async () => {
    setLoadingPlan(true);
    setPlanError(null);
    try {
      const response = await api.planItems.getForDate(toDateInputValue(selectedDate));
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
    () => planItems.filter((item) => item.saved_data?.status === "done").length,
    [planItems],
  );
  const totalCount = planItems.length;
  const completionSum = useMemo(
    () => planItems.reduce((sum, item) => {
      if (item.planner_type === "metric" && (item.planner_target ?? 0) > 0) {
        return sum + Math.min(1, (item.saved_data?.current_value ?? 0) / item.planner_target!);
      }
      return sum + (item.saved_data?.status === "done" ? 1 : 0);
    }, 0),
    [planItems],
  );
  const completion = totalCount > 0 ? Math.round((completionSum / totalCount) * 100) : 0;

  const estimatedMinutes = useMemo(
    () => planItems.reduce((sum, item) => sum + (item.duration_minutes ?? 0), 0),
    [planItems],
  );

  const activeItems = useMemo(
    () => planItems.filter(
      (item) => item.saved_data?.status !== "done" || completingIds.has(item.plan_id),
    ),
    [planItems, completingIds],
  );
  const doneItems = useMemo(
    () => planItems.filter(
      (item) => item.saved_data?.status === "done" && !completingIds.has(item.plan_id),
    ),
    [planItems, completingIds],
  );

  function updateItemSavedData(recordId: number, savedData: DailyPlanSavedData) {
    setPlanData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map((item) =>
          item.saved_data?.record_id === recordId
            ? { ...item, saved_data: savedData }
            : item,
        ),
      };
    });
  }

  function removeCompletingId(planId: number) {
    setCompletingIds((prev) => {
      const next = new Set(prev);
      next.delete(planId);
      return next;
    });
  }

  function handleToggle(planId: number) {
    const item = planData?.items.find((i) => i.plan_id === planId);
    const currentStatus = item?.saved_data?.status ?? "due";
    if (currentStatus === "done") {
      void toggleToDue(planId);
    } else {
      void toggleToDone(planId);
    }
  }

  async function toggleToDone(planId: number) {
    const item = planData?.items.find((i) => i.plan_id === planId);
    const recordId = item?.saved_data?.record_id;
    if (!recordId) return;

    setBusyIds((prev) => new Set([...prev, planId]));
    try {
      const savedData = await api.planItems.updateRecord(recordId, { status: "done" });
      updateItemSavedData(recordId, savedData);
      setCompletingIds((prev) => new Set([...prev, planId]));
      setTimeout(() => removeCompletingId(planId), COMPLETE_ANIM_MS);
    } catch {
      toast.error("Couldn't update status. Please try again.");
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(planId);
        return next;
      });
    }
  }

  async function toggleToDue(planId: number) {
    const item = planData?.items.find((i) => i.plan_id === planId);
    const recordId = item?.saved_data?.record_id;
    if (!recordId) return;

    setBusyIds((prev) => new Set([...prev, planId]));
    try {
      const savedData = await api.planItems.updateRecord(recordId, { status: "due" });
      updateItemSavedData(recordId, savedData);
    } catch {
      toast.error("Couldn't update status. Please try again.");
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(planId);
        return next;
      });
    }
  }

  async function handleSaveProgress(planId: number, value: number) {
    const item = planData?.items.find((i) => i.plan_id === planId);
    const recordId = item?.saved_data?.record_id;
    if (!recordId) return;
    const prevStatus = item?.saved_data?.status;

    try {
      const savedData = await api.planItems.updateRecord(recordId, { actual_value: value });
      if (savedData.status === "done" && prevStatus !== "done") {
        setCompletingIds((prev) => new Set([...prev, planId]));
        updateItemSavedData(recordId, savedData);
        setTimeout(() => {
          setCompletingIds((prev) => {
            const next = new Set(prev);
            next.delete(planId);
            return next;
          });
        }, COMPLETE_ANIM_MS);
      } else {
        updateItemSavedData(recordId, savedData);
      }
    } catch {
      toast.error("Couldn't save progress. Please try again.");
    }
  }

  async function handleSaveNote(planId: number, note: string) {
    const item = planData?.items.find((i) => i.plan_id === planId);
    const recordId = item?.saved_data?.record_id;
    if (!recordId) return;

    try {
      const savedData = await api.planItems.updateRecord(recordId, { note });
      updateItemSavedData(recordId, savedData);
    } catch {
      toast.error("Couldn't save note. Please try again.");
    }
  }

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
              max={toDateInputValue(TODAY)}
              onChange={(event) => setSelectedDate(new Date(`${event.target.value}T00:00:00`))}
              onClick={(e) => e.currentTarget.showPicker?.()}
              aria-label="Plan date"
            />
          </label>
          <button
            type="button"
            className="plan-icon-button"
            aria-label="Next day"
            disabled={isToday}
            onClick={() => setSelectedDate((date) => shiftDate(date, 1))}
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="plan-action-buttons">
          {!isToday && (
            <button type="button" className="plan-secondary-button" onClick={() => setSelectedDate(TODAY)}>
              <CalendarCheckFill size={15} /> {"Today"}
            </button>
          )}
          <button type="button" className="plan-primary-button" onClick={() => navigate(ROUTES.SCHEDULE)}>
            <Plus size={26} /> Schedule
          </button>
        </div>
      </div>

      <div className="plan-columns">
        <div className="plan-column">
          <section className="plan-panel today-panel">
            <h2>{isToday ? "Your Today's Plan" : formatDisplayDate(selectedDate)}</h2>

            {loadingPlan ? (
              <div className="plan-task-list">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="plan-card-skeleton">
                    <div className="pcs-row">
                      <span className="pcs pcs-title" style={{ width: `${55 + (i % 3) * 12}%` }} />
                      <span className="pcs pcs-check" />
                    </div>
                    <div className="pcs-row pcs-row--chips">
                      <span className="pcs pcs-chip" />
                      <span className="pcs pcs-chip pcs-chip--wide" />
                    </div>
                  </div>
                ))}
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
                  {isToday
                    ? "You're all clear. Enjoy the day or add something manually."
                    : "You can add something manually or check another date."}
                </p>
              </div>
            ) : (
              <div className="plan-task-list">
                {activeItems.map((item) => (
                  <PlanCard
                    key={item.saved_data?.record_id ?? item.plan_id}
                    item={item}
                    readOnly={!isToday}
                    isCompleting={completingIds.has(item.plan_id)}
                    busy={busyIds.has(item.plan_id)}
                    onToggle={() => handleToggle(item.plan_id)}
                    onSaveProgress={(value) => handleSaveProgress(item.plan_id, value)}
                    onSaveNote={(note) => handleSaveNote(item.plan_id, note)}
                  />
                ))}
                {doneItems.length > 0 && (
                  <>
                    <div className="plan-task-section-label">Completed</div>
                    {doneItems.map((item) => (
                      <PlanCard
                        key={item.saved_data?.record_id ?? item.plan_id}
                        item={item}
                        readOnly={!isToday}
                        busy={busyIds.has(item.plan_id)}
                        onToggle={() => handleToggle(item.plan_id)}
                        onSaveProgress={(value) => handleSaveProgress(item.plan_id, value)}
                        onSaveNote={(note) => handleSaveNote(item.plan_id, note)}
                      />
                    ))}

                  </>
                )}
              </div>
            )}
          </section>
        </div>

        <div className="plan-column">
          {!loadingPlan && totalCount > 0 && (
            <section className="plan-panel progress-panel">
              <ProgressRing percentage={completion} />
              <h2>{doneCount} of {totalCount} done</h2>
              <p>{progressMessage}</p>
            </section>
          )}

          <DayOverviewPanel
            items={planItems}
            loading={loadingPlan}
            isToday={isToday}
            estimatedMinutes={estimatedMinutes}
          />
        </div>
      </div>
    </section>
  );
}
