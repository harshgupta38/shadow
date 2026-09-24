import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Calendar3,
  CalendarCheckFill,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeSlash,
  MoonFill,
  MoonStarsFill,
  Plus,
  SunFill,
} from "react-bootstrap-icons";

import { api, ApiError } from "@/api";
import type { DailyPlanSavedData, PlanResponse } from "@/api";
import { ROUTES } from "@/routes/RoutePaths";
import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import { ProgressRing } from "@/components/ui/ProgressRing/ProgressRing";
import { completionMessage } from "@/pages/dashboard/TodaySnapshot/TodaySnapshot.constants";
import {
  toDateInputValue,
  formatDisplayDate,
  shiftDate,
} from "@/pages/plan/PlanPage.constants";
import { currentIstHour, todayDate } from "@/services/date.service";
import { useDateParam } from "@/hooks/useUrlAnchor";
import { PlanCard } from "@/pages/plan/PlanCard/PlanCard";
import { DayOverviewPanel } from "@/pages/plan/DayOverviewPanel/DayOverviewPanel";
import { YesterdayClosingPanel } from "@/pages/plan/YesterdayClosingPanel/YesterdayClosingPanel";
import { useDateFormat } from "@/context/PlannerContext";
import { useToast } from "@/context/ToastContext";
import { ANIMATION, TIMING } from "@/constant/tuning";
import "@/pages/plan/PlanPage.scss";

const COMPLETE_ANIM_MS = ANIMATION.PLAN_ITEM_COMPLETE_MS;
const TODAY_REFRESH_MS = TIMING.PLAN_DAY_ROLLOVER_CHECK_MS;

// Same morning/afternoon -> sun, evening/night -> moon mapping as PlanCard's TimeChip,
// but driven by the current IST clock instead of a task's stored preferred time.
function briefMeIcon(): ReactNode {
  const hour = currentIstHour();

  if (hour >= 17 && hour < 21) return <MoonFill size={15} />;
  if (hour >= 21 || hour < 5) return <MoonStarsFill size={14} />;
  return <SunFill size={15} />;
}

function ReconstructedPastStateIllustration() {
  return (
    <svg
      className="reconstructed-state-svg"
      viewBox="0 0 400 300"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Calendar page being rebuilt with a rewind clock and puzzle piece"
    >
      <defs>
        <linearGradient id="planReconstructClockGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--jv-brand-1)" />
          <stop offset="100%" stopColor="var(--jv-brand-2)" />
        </linearGradient>
      </defs>

      <g transform="rotate(-3 200 150)">
        <rect x="88" y="52" width="224" height="188" rx="16" className="reconstructed-state-svg-calendar" />
        <rect x="88" y="52" width="224" height="40" rx="16" className="reconstructed-state-svg-calendar-head" />
        <circle cx="132" cy="52" r="6" className="reconstructed-state-svg-calendar-ring" />
        <circle cx="268" cy="52" r="6" className="reconstructed-state-svg-calendar-ring" />

        <line x1="108" y1="120" x2="292" y2="120" className="reconstructed-state-svg-grid-line" />
        <line x1="108" y1="152" x2="292" y2="152" className="reconstructed-state-svg-grid-line" />
        <line x1="108" y1="184" x2="292" y2="184" className="reconstructed-state-svg-grid-line" />
        <line x1="108" y1="216" x2="292" y2="216" className="reconstructed-state-svg-grid-line" />
        <line x1="160" y1="104" x2="160" y2="228" className="reconstructed-state-svg-grid-line" />
        <line x1="212" y1="104" x2="212" y2="228" className="reconstructed-state-svg-grid-line" />
        <line x1="264" y1="104" x2="264" y2="228" className="reconstructed-state-svg-grid-line" />

        <rect x="160" y="152" width="52" height="32" rx="6" className="reconstructed-state-svg-highlight" />
      </g>

      <g transform="translate(112 96)">
        <path
          d="M0 10 h13 v-7 a7 7 0 0 1 13 0 v7 h13 v13 h-7 a7 7 0 0 0 0 13 h7 v13 h-13 v-7 a7 7 0 0 0 -13 0 v7 h-13z"
          className="reconstructed-state-svg-puzzle"
        />
      </g>

      <g transform="translate(292 208)">
        <circle r="44" fill="url(#planReconstructClockGrad)" className="reconstructed-state-svg-clock-shadow" />
        <circle r="35" className="reconstructed-state-svg-clock-face" />
        <path d="M0 -35 A35 35 0 1 0 27 -22" className="reconstructed-state-svg-rewind-arc" fill="none" />
        <path d="M27 -22 L12 -20 L22 -8 Z" className="reconstructed-state-svg-rewind-arrow" />
        <line x1="0" y1="0" x2="0" y2="-19" className="reconstructed-state-svg-clock-hand" />
        <line x1="0" y1="0" x2="13" y2="7" className="reconstructed-state-svg-clock-hand-min" />
        <circle r="4" className="reconstructed-state-svg-clock-pin" />
      </g>

      <circle cx="66" cy="228" r="3" className="reconstructed-state-svg-speck" />
      <circle cx="336" cy="94" r="4" className="reconstructed-state-svg-speck" />
      <circle cx="344" cy="244" r="2.5" className="reconstructed-state-svg-speck" />
    </svg>
  );
}

export function PlanPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const dateFormat = useDateFormat();

  // IST-anchored "today", refreshed periodically so a tab left open past midnight doesn't get stuck.
  const [today, setToday] = useState(() => todayDate());
  // Selected date is mirrored in the URL (?date=) so navigating away (e.g. to
  // Schedule) and back, or refreshing the tab, keeps the date the user was on.
  const { iso: selectedDateIso, setDate: setSelectedDateIso } = useDateParam();
  const selectedDate = useMemo(() => new Date(`${selectedDateIso}T00:00:00`), [selectedDateIso]);
  function setSelectedDate(next: Date | ((date: Date) => Date)) {
    const nextDate = typeof next === "function" ? next(selectedDate) : next;
    setSelectedDateIso(toDateInputValue(nextDate));
  }
  const [planData, setPlanData] = useState<PlanResponse | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [completingIds, setCompletingIds] = useState<Set<number>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const [completedOpen, setCompletedOpen] = useState(false);
  const [skippedOpen, setSkippedOpen] = useState(false);
  const [generatingBrief, setGeneratingBrief] = useState(false);

  useEffect(() => {
    function refreshToday() {
      const now = todayDate();
      setToday((prev) => (prev.toDateString() === now.toDateString() ? prev : now));
    }
    const intervalId = window.setInterval(refreshToday, TODAY_REFRESH_MS);
    document.addEventListener("visibilitychange", refreshToday);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshToday);
    };
  }, []);

  const isToday = selectedDate.toDateString() === today.toDateString();
  const dailyBriefEnabled = planData?.daily_brief_enabled ?? false;
  const briefExists = planData?.daily_brief_generated ?? false;

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

  const skippedItems = useMemo(
    () => planItems.filter((item) => item.saved_data?.skipped),
    [planItems],
  );
  const skippedCount = skippedItems.length;

  const isReconstructedPastDate = !isToday && planData?.no_plan_generated === true;

  const activeItems = useMemo(
    () => planItems.filter(
      (item) =>
        (item.saved_data?.status !== "done" || completingIds.has(item.plan_id)) &&
        (!item.saved_data?.skipped || skippedOpen),
    ),
    [planItems, completingIds, skippedOpen],
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

  async function handleToggleSkip(planId: number) {
    const item = planData?.items.find((i) => i.plan_id === planId);
    const recordId = item?.saved_data?.record_id;
    if (!recordId) return;
    const nextSkipped = !item?.saved_data?.skipped;

    setBusyIds((prev) => new Set([...prev, planId]));
    try {
      const savedData = await api.planItems.updateRecord(recordId, { skipped: nextSkipped });
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

  async function handleSaveNoteAndDone(planId: number, note: string) {
    const item = planData?.items.find((i) => i.plan_id === planId);
    const recordId = item?.saved_data?.record_id;
    if (!recordId) return;

    try {
      const savedData = await api.planItems.updateRecord(recordId, { note, status: "done" });
      updateItemSavedData(recordId, savedData);
      setCompletingIds((prev) => new Set([...prev, planId]));
      setTimeout(() => removeCompletingId(planId), COMPLETE_ANIM_MS);
    } catch {
      toast.error("Couldn't save. Please try again.");
    }
  }

  async function handleBriefMe() {
    const dateStr = toDateInputValue(selectedDate);

    if (isToday && !briefExists) {
      if (totalCount === 0) {
        toast.info("No plan items yet — nothing to brief.");
        return;
      }
      setGeneratingBrief(true);
      try {
        await api.dailyBrief.generate(dateStr);
        navigate(`${ROUTES.DAILY_BRIEF}?date=${dateStr}`);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Couldn't generate the brief. Please try again.");
      } finally {
        setGeneratingBrief(false);
      }
      return;
    }

    navigate(`${ROUTES.DAILY_BRIEF}?date=${dateStr}`);
  }

  const progressMessage =
    totalCount === 0
      ? "Plan a few tasks to get started."
      : completionMessage(completion);


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
            <span className="date-display" aria-hidden="true">{formatDisplayDate(selectedDate, dateFormat)}</span>
            <Calendar3 className="date-calendar-icon" size={16} aria-hidden="true" />
            <input
              type="date"
              value={toDateInputValue(selectedDate)}
              max={toDateInputValue(today)}
              onChange={(event) => { if (event.target.value) setSelectedDate(new Date(`${event.target.value}T00:00:00`)); }}
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
            <button type="button" className="plan-secondary-button" onClick={() => setSelectedDate(today)}>
              <CalendarCheckFill size={15} /> {"Today"}
            </button>
          )}
          {dailyBriefEnabled && !loadingPlan && (isToday || briefExists) && (
            <button
              type="button"
              className="plan-secondary-button"
              disabled={generatingBrief}
              onClick={handleBriefMe}
            >
              {generatingBrief
                ? <span className="spinner-border spinner-border-sm" aria-hidden="true" />
                : briefMeIcon()}
              {generatingBrief ? "Generating…" : "Brief me"}
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
            <h2 style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
              {isToday ? "Your Today's Plan" : formatDisplayDate(selectedDate, dateFormat)}
              <span style={{ fontSize: "0.9rem", fontWeight: 400, color: "var(--jv-muted)" }}>
                {selectedDate.toLocaleDateString(undefined, { weekday: "long" })}
              </span>
              {skippedCount > 0 && (
                <button
                  type="button"
                  className="plan-header-icon-btn"
                  style={{ marginLeft: "auto", alignSelf: "center" }}
                  aria-label={skippedOpen ? "Hide skipped items" : `Show ${skippedCount} skipped item${skippedCount === 1 ? "" : "s"}`}
                  title={skippedOpen ? "Hide skipped items" : "Show skipped items"}
                  onClick={() => setSkippedOpen((o) => !o)}
                >
                  {skippedOpen ? <EyeSlash size={16} /> : <Eye size={16} />}
                </button>
              )}
            </h2>

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
                <p>
                  {planError} Please{" "}
                  <button type="button" className="btn-link-inline" onClick={() => void loadPlan()}>
                    try again
                  </button>
                  .
                </p>
              </div>
            ) : isReconstructedPastDate ? (
              <section className="reconstructed-state" aria-live="polite">
                <div className="reconstructed-state-illustration" aria-hidden="true">
                  <ReconstructedPastStateIllustration />
                </div>
                <p className="reconstructed-state-code">PAST VIEW</p>
                <h3 className="reconstructed-state-title">No saved planner timeline for this date</h3>
                <p className="reconstructed-state-text">
                  Planner was not opened on this date, so no plan records were generated.
                </p>
              </section>
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
            ) : activeItems.length === 0 && doneItems.length === 0 && skippedCount > 0 ? (
              <div className="empty-state">
                <span className="empty-state-icon"><EyeSlash size={20} /></span>
                <h3 className="text-normal">Nothing to do — {skippedCount} skipped</h3>
                <p>
                  {isToday ? "Everything left for today was skipped. " : "Everything left on this date was skipped. "}
                  <button type="button" className="btn-link-inline" onClick={() => setSkippedOpen(true)}>
                    Show skipped items
                  </button>
                  .
                </p>
              </div>
            ) : activeItems.length === 0 ? (
              <div className="empty-state">
                <span className="empty-state-icon">🎉</span>
                <h3 className="text-normal">{isToday ? "All done — great work!" : "You crushed it that day!"}</h3>
                <p>{isToday ? "You've completed everything on your list. Keep it up!" : "Everything was completed on this date."}</p>
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
                    onToggleSkip={() => handleToggleSkip(item.plan_id)}
                    onSaveProgress={(value) => handleSaveProgress(item.plan_id, value)}
                    onSaveNote={(note) => handleSaveNote(item.plan_id, note)}
                    onSaveNoteAndDone={(note) => handleSaveNoteAndDone(item.plan_id, note)}
                  />
                ))}
              </div>
            )}
          </section>

          {!loadingPlan && !planError && doneItems.length > 0 && (
            <section className="plan-panel completed-panel">
              <button
                type="button"
                className="completed-panel-header"
                onClick={() => setCompletedOpen((o) => !o)}
                aria-expanded={completedOpen}
              >
                <span className="completed-panel-title">Completed</span>
                <span className="completed-panel-count">{doneItems.length}</span>
                <ChevronDown
                  className={`completed-panel-chevron${completedOpen ? " is-open" : ""}`}
                  size={15}
                />
              </button>
              <div className={`completed-panel-collapse${completedOpen ? " is-open" : ""}`}>
                <div className="completed-panel-collapse-inner">
                  <div className="plan-task-list mt-0">
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
                  </div>
                </div>
              </div>
            </section>
          )}
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

          {isToday && <YesterdayClosingPanel closing={planData?.previous_day_closing ?? null} />}
        </div>
      </div>
    </section>
  );
}
