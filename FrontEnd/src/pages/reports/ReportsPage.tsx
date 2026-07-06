import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  CalendarWeek,
  ClockHistory,
  FileEarmarkBarGraphFill,
  GearFill,
  LightningChargeFill,
} from "react-bootstrap-icons";

import {
  api,
  ApiError,
  type ReportAutomation,
  type ReportAutomationWeekday,
  type ReportHistoryCard,
  type ReportPeriod,
  type RepetitiveTask,
  type TrackedMetric,
} from "@/api";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { SectionCard } from "@/components/ui/SectionCard";
import { useToast } from "@/context/ToastContext";
import { useAsync } from "@/hooks/useAsync";
import { formatDate, relativeTime } from "@/lib/format";

type Filter = "all" | ReportPeriod;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
];

const WEEKDAY_OPTIONS: Array<{ value: ReportAutomationWeekday; label: string }> = [
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
  { value: "sunday", label: "Sunday" },
];

function parseFilter(value: string | null): Filter {
  if (value === "daily" || value === "weekly") return value;
  return "all";
}

function formatHistoryDate(value: string): string {
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return value;
  return formatDate(new Date(year, month - 1, day, 12));
}

function buildViewerPath(historyDate: string, reportId: number, period?: ReportPeriod): string {
  const params = new URLSearchParams();
  if (period) params.set("period", period);
  params.set("reportId", String(reportId));
  return `/reports/day/${historyDate}?${params.toString()}`;
}

function sectionsEqual<T>(left: T, right: T): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function HistoryCard({ card, onOpen }: { card: ReportHistoryCard; onOpen: () => void }) {
  return (
    <button type="button" className="surface p-4 text-start w-100 border-0 card-hover h-100" onClick={onOpen}>
      <div className="d-flex align-items-center justify-content-between gap-2 mb-2 flex-wrap">
        <div className="d-flex align-items-center gap-2 flex-wrap">
          {card.report_periods.map((period) => (
            <Pill key={period} variant={period === "weekly" ? "info" : "brand"}>
              <CalendarWeek size={12} /> {period === "weekly" ? "Weekly" : "Daily"}
            </Pill>
          ))}
          <Pill variant="muted">{card.versions_count} version{card.versions_count === 1 ? "" : "s"}</Pill>
        </div>
        <span className="text-faint small">{relativeTime(card.latest_created_at)}</span>
      </div>

      <div className="fw-bold mb-1">{formatHistoryDate(card.history_date)}</div>
      <div className="small text-muted-2 mb-2">Latest generated {formatDate(card.latest_created_at)}</div>
      {card.latest_narrative_snippet && (
        <p className="text-muted-2 small line-clamp-2 mb-0">{card.latest_narrative_snippet}</p>
      )}
    </button>
  );
}

interface AutomationToggleRowProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

function AutomationToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
}: AutomationToggleRowProps) {
  return (
    <div className="d-flex align-items-start justify-content-between gap-3 surface-2 p-3">
      <div>
        <label className="fw-semibold d-block mb-1" htmlFor={id}>
          {label}
        </label>
        <div className="text-muted-2 small">{description}</div>
      </div>
      <div className="form-check form-switch m-0 pt-1">
        <input
          id={id}
          className="form-check-input"
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
      </div>
    </div>
  );
}

export function ReportsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const filter = parseFilter(searchParams.get("period"));
  const [genPeriod, setGenPeriod] = useState<ReportPeriod>("daily");
  const [generating, setGenerating] = useState(false);

  const [showAutomation, setShowAutomation] = useState(false);
  const [automationLoading, setAutomationLoading] = useState(false);
  const [automationSaving, setAutomationSaving] = useState(false);
  const [automationError, setAutomationError] = useState<string | null>(null);
  const [automationDraft, setAutomationDraft] = useState<ReportAutomation | null>(null);
  const [automationBaseline, setAutomationBaseline] = useState<ReportAutomation | null>(null);
  const [metricOptions, setMetricOptions] = useState<TrackedMetric[]>([]);
  const [habitOptions, setHabitOptions] = useState<RepetitiveTask[]>([]);

  const { data, loading, error, reload, setData } = useAsync(
    () => api.reports.history(filter === "all" ? undefined : filter),
    [filter],
  );

  const historyCards = data ?? [];

  const automationDirty = useMemo(() => {
    if (!automationDraft || !automationBaseline) return false;
    return !sectionsEqual(automationDraft, automationBaseline);
  }, [automationBaseline, automationDraft]);

  useEffect(() => {
    if (!showAutomation || automationDraft) return;

    setAutomationLoading(true);
    setAutomationError(null);

    Promise.all([api.reports.getAutomation(), api.metrics.list(), api.repetitiveTasks.list()])
      .then(([automation, metrics, habits]) => {
        setAutomationDraft(automation);
        setAutomationBaseline(automation);
        setMetricOptions(metrics.filter((metric) => metric.active));
        setHabitOptions(habits.filter((habit) => habit.status !== "archived"));
      })
      .catch((err: unknown) => {
        setAutomationError(err instanceof ApiError ? err.message : "Couldn't load automation settings.");
      })
      .finally(() => {
        setAutomationLoading(false);
      });
  }, [automationDraft, showAutomation]);

  function setFilter(nextFilter: Filter) {
    const next = new URLSearchParams(searchParams);
    if (nextFilter === "all") next.delete("period");
    else next.set("period", nextFilter);
    setSearchParams(next, { replace: true });
  }

  function updateAutomation<K extends keyof ReportAutomation>(
    key: K,
    value: ReportAutomation[K],
  ) {
    setAutomationDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function toggleSelectedMetric(metricId: number) {
    if (!automationDraft) return;
    const selected = new Set(automationDraft.selected_metric_ids);
    if (selected.has(metricId)) selected.delete(metricId);
    else selected.add(metricId);
    updateAutomation("selected_metric_ids", Array.from(selected));
  }

  function toggleSelectedHabit(habitId: number) {
    if (!automationDraft) return;
    const selected = new Set(automationDraft.selected_habit_ids);
    if (selected.has(habitId)) selected.delete(habitId);
    else selected.add(habitId);
    updateAutomation("selected_habit_ids", Array.from(selected));
  }

  async function saveAutomation() {
    if (!automationDraft || !automationDirty || automationSaving) return;

    setAutomationSaving(true);
    try {
      const updated = await api.reports.updateAutomation(automationDraft);
      setAutomationDraft(updated);
      setAutomationBaseline(updated);
      toast.success("Automation flow updated.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save automation settings.");
    } finally {
      setAutomationSaving(false);
    }
  }

  async function generate() {
    setGenerating(true);
    try {
      const report = await api.reports.generate({ period: genPeriod });
      const refreshed = await api.reports.history();
      setData(refreshed);
      toast.success(`${genPeriod === "weekly" ? "Weekly" : "Daily"} report ready.`);

      const target = refreshed.find((card) => card.latest_report_id === report.id);
      if (target) {
        navigate(buildViewerPath(target.history_date, report.id));
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't generate the report.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Shadow keeps your reflections organized by day so you can revisit every version."
        icon={<FileEarmarkBarGraphFill size={20} />}
        actions={
          <button
            type="button"
            className={`btn ${showAutomation ? "btn-brand" : "btn-outline-secondary"}`}
            onClick={() => setShowAutomation((prev) => !prev)}
          >
            <GearFill size={14} className="me-1" /> {showAutomation ? "Hide automation" : "Automation"}
          </button>
        }
      />

      {showAutomation && (
        <SectionCard className="mb-4">
          <div className="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3 mb-3">
            <div>
              <h2 className="h6 fw-bold mb-1">Report automation flow</h2>
              <p className="text-muted-2 small mb-0">
                Decide when reports auto-generate and which snapshots are stored in each automatic reflection.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-brand"
              onClick={saveAutomation}
              disabled={!automationDirty || automationSaving || automationLoading || !automationDraft}
            >
              {automationSaving ? "Saving..." : "Save automation"}
            </button>
          </div>

          {automationLoading && <div className="text-muted-2 small">Loading automation settings...</div>}

          {automationError && !automationLoading && (
            <div className="surface-2 p-3 text-danger small">{automationError}</div>
          )}

          {!automationLoading && !automationError && automationDraft && (
            <div className="d-flex flex-column gap-3">
              <AutomationToggleRow
                id="reports-automation-enabled"
                label="Enable report automation"
                description="If disabled, Shadow won't auto-generate reports for this account."
                checked={automationDraft.enabled}
                onChange={(checked) => updateAutomation("enabled", checked)}
              />

              <div className="row g-3">
                <div className="col-lg-6">
                  <div className="surface-2 p-3 h-100 d-flex flex-column gap-3">
                    <AutomationToggleRow
                      id="reports-automation-daily"
                      label="Auto-generate Daily report"
                      description="Generate one Daily report at your selected time."
                      checked={automationDraft.daily_enabled}
                      disabled={!automationDraft.enabled}
                      onChange={(checked) => updateAutomation("daily_enabled", checked)}
                    />
                    <label className="small fw-semibold text-muted-2" htmlFor="reports-automation-daily-time">
                      Daily report time
                    </label>
                    <input
                      id="reports-automation-daily-time"
                      type="time"
                      className="form-control"
                      value={automationDraft.daily_time}
                      disabled={!automationDraft.enabled || !automationDraft.daily_enabled}
                      onChange={(event) => updateAutomation("daily_time", event.target.value)}
                    />
                  </div>
                </div>

                <div className="col-lg-6">
                  <div className="surface-2 p-3 h-100 d-flex flex-column gap-3">
                    <AutomationToggleRow
                      id="reports-automation-weekly"
                      label="Auto-generate Weekly report"
                      description="Generate one Weekly trend report on your chosen day and time."
                      checked={automationDraft.weekly_enabled}
                      disabled={!automationDraft.enabled}
                      onChange={(checked) => updateAutomation("weekly_enabled", checked)}
                    />
                    <div className="row g-2">
                      <div className="col-sm-6">
                        <label className="small fw-semibold text-muted-2" htmlFor="reports-automation-weekly-day">
                          Weekly day
                        </label>
                        <select
                          id="reports-automation-weekly-day"
                          className="form-select"
                          value={automationDraft.weekly_day}
                          disabled={!automationDraft.enabled || !automationDraft.weekly_enabled}
                          onChange={(event) =>
                            updateAutomation(
                              "weekly_day",
                              event.target.value as ReportAutomationWeekday,
                            )
                          }
                        >
                          {WEEKDAY_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="col-sm-6">
                        <label className="small fw-semibold text-muted-2" htmlFor="reports-automation-weekly-time">
                          Weekly time
                        </label>
                        <input
                          id="reports-automation-weekly-time"
                          type="time"
                          className="form-control"
                          value={automationDraft.weekly_time}
                          disabled={!automationDraft.enabled || !automationDraft.weekly_enabled}
                          onChange={(event) => updateAutomation("weekly_time", event.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="surface-2 p-3 d-flex flex-column gap-2">
                <h3 className="h6 fw-bold mb-1">Snapshot content</h3>
                <AutomationToggleRow
                  id="reports-snapshot-plan"
                  label="Plan snapshot"
                  description="Store planned/completed task totals in automatic reports."
                  checked={automationDraft.include_plan_snapshot}
                  disabled={!automationDraft.enabled}
                  onChange={(checked) => updateAutomation("include_plan_snapshot", checked)}
                />
                <AutomationToggleRow
                  id="reports-snapshot-missed"
                  label="Missed tasks"
                  description="Add missed-task totals as part of your plan snapshot."
                  checked={automationDraft.include_missed_tasks_snapshot}
                  disabled={!automationDraft.enabled || !automationDraft.include_plan_snapshot}
                  onChange={(checked) => updateAutomation("include_missed_tasks_snapshot", checked)}
                />
                <AutomationToggleRow
                  id="reports-snapshot-goals"
                  label="Goals snapshot"
                  description="Store active goal counts and progress signals."
                  checked={automationDraft.include_goals_snapshot}
                  disabled={!automationDraft.enabled}
                  onChange={(checked) => updateAutomation("include_goals_snapshot", checked)}
                />
                <AutomationToggleRow
                  id="reports-snapshot-habits"
                  label="Habits snapshot"
                  description="Store repetitive-habit status and chosen habit items."
                  checked={automationDraft.include_habits_snapshot}
                  disabled={!automationDraft.enabled}
                  onChange={(checked) => updateAutomation("include_habits_snapshot", checked)}
                />
                <AutomationToggleRow
                  id="reports-snapshot-metrics"
                  label="Tracking snapshot"
                  description="Store metric totals and selected tracking items."
                  checked={automationDraft.include_metrics_snapshot}
                  disabled={!automationDraft.enabled}
                  onChange={(checked) => updateAutomation("include_metrics_snapshot", checked)}
                />
                <AutomationToggleRow
                  id="reports-snapshot-streaks"
                  label="Streak snapshot"
                  description="Store top current streaks computed from tracked metrics."
                  checked={automationDraft.include_streaks_snapshot}
                  disabled={!automationDraft.enabled}
                  onChange={(checked) => updateAutomation("include_streaks_snapshot", checked)}
                />
              </div>

              {automationDraft.include_metrics_snapshot && (
                <div className="surface-2 p-3">
                  <h3 className="h6 fw-bold mb-2">Tracking items to store</h3>
                  <p className="text-muted-2 small mb-2">
                    Leave all unselected to include every active tracking metric.
                  </p>
                  {metricOptions.length === 0 ? (
                    <div className="text-faint small">No active tracking items found.</div>
                  ) : (
                    <div className="d-flex flex-wrap gap-2">
                      {metricOptions.map((metric) => {
                        const selected = automationDraft.selected_metric_ids.includes(metric.id);
                        return (
                          <button
                            key={metric.id}
                            type="button"
                            className={`btn btn-sm ${selected ? "btn-brand" : "btn-outline-secondary"}`}
                            disabled={!automationDraft.enabled}
                            onClick={() => toggleSelectedMetric(metric.id)}
                          >
                            {metric.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {automationDraft.include_habits_snapshot && (
                <div className="surface-2 p-3">
                  <h3 className="h6 fw-bold mb-2">Habit items to store</h3>
                  <p className="text-muted-2 small mb-2">
                    Leave all unselected to include every active or paused habit.
                  </p>
                  {habitOptions.length === 0 ? (
                    <div className="text-faint small">No habits found yet.</div>
                  ) : (
                    <div className="d-flex flex-wrap gap-2">
                      {habitOptions.map((habit) => {
                        const selected = automationDraft.selected_habit_ids.includes(habit.id);
                        return (
                          <button
                            key={habit.id}
                            type="button"
                            className={`btn btn-sm ${selected ? "btn-brand" : "btn-outline-secondary"}`}
                            disabled={!automationDraft.enabled}
                            onClick={() => toggleSelectedHabit(habit.id)}
                          >
                            {habit.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="surface-2 p-3">
                <h3 className="h6 fw-bold mb-1">Ideas to enrich report cards</h3>
                <p className="text-muted-2 small mb-0">
                  Beyond tasks and metrics, your marksheet can also include journal mood trends, focus-block adherence,
                  blocker tags, and confidence changes per goal over time.
                </p>
              </div>
            </div>
          )}
        </SectionCard>
      )}

      <SectionCard className="mb-4">
        <div className="d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-3">
          <div>
            <h2 className="h6 fw-bold mb-1">Generate a report</h2>
            <p className="text-muted-2 small mb-0">
              Create a fresh reflection now. Automatic reports are generated in the background at night.
            </p>
          </div>
          <div className="d-flex align-items-center gap-2">
            <div className="nav-tabs-jv">
              {(["daily", "weekly"] as ReportPeriod[]).map((period) => (
                <button
                  key={period}
                  type="button"
                  className={`nav-tab-jv ${genPeriod === period ? "active" : ""}`}
                  onClick={() => setGenPeriod(period)}
                >
                  {period === "daily" ? "Daily" : "Weekly"}
                </button>
              ))}
            </div>
            <button className="btn btn-brand flex-shrink-0" onClick={generate} disabled={generating}>
              <LightningChargeFill size={15} className="me-1" />
              {generating ? "Generating..." : "Generate"}
            </button>
          </div>
        </div>
      </SectionCard>

      <div className="nav-tabs-jv mb-4">
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            className={`nav-tab-jv ${filter === item.value ? "active" : ""}`}
            onClick={() => setFilter(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading && <LoadingState label="Loading report history..." />}

      {error && !loading && (
        <EmptyState
          icon={<FileEarmarkBarGraphFill size={26} />}
          title="Couldn't load reports"
          message={error}
          action={
            <button className="btn btn-brand" onClick={reload}>
              Retry
            </button>
          }
        />
      )}

      {!loading && !error && historyCards.length === 0 && (
        <div className="surface">
          <EmptyState
            icon={<ClockHistory size={26} />}
            title="No report history yet"
            message="Generate your first daily or weekly report to start building your reflection timeline."
            action={
              <button className="btn btn-brand" onClick={generate} disabled={generating}>
                <LightningChargeFill size={15} className="me-1" /> Generate report
              </button>
            }
          />
        </div>
      )}

      {!loading && !error && historyCards.length > 0 && (
        <div className="row g-3">
          {historyCards.map((card) => (
            <div className="col-md-6 col-xl-4" key={card.history_date}>
              <HistoryCard
                card={card}
                onOpen={() =>
                  navigate(
                    buildViewerPath(
                      card.history_date,
                      card.latest_report_id,
                      filter === "all" ? undefined : filter,
                    ),
                  )
                }
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
