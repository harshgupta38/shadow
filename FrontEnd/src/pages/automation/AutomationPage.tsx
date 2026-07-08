import { useEffect, useMemo, useState } from "react";
import { GearFill } from "react-bootstrap-icons";

import {
  api,
  ApiError,
  type ReportAutomation,
  type ReportAutomationWeekday,
  type RepetitiveTask,
  type TrackedMetric,
} from "@/api";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { useToast } from "@/context/ToastContext";
import { useAsync } from "@/hooks/useAsync";

const WEEKDAY_OPTIONS: Array<{ value: ReportAutomationWeekday; label: string }> = [
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
  { value: "sunday", label: "Sunday" },
];

function sectionsEqual<T>(left: T, right: T): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
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

export function AutomationPage() {
  const toast = useToast();

  const [saving, setSaving] = useState(false);
  const [automationDraft, setAutomationDraft] = useState<ReportAutomation | null>(null);
  const [automationBaseline, setAutomationBaseline] = useState<ReportAutomation | null>(null);
  const [metricOptions, setMetricOptions] = useState<TrackedMetric[]>([]);
  const [habitOptions, setHabitOptions] = useState<RepetitiveTask[]>([]);

  const { data, loading, error, reload } = useAsync(
    async () => {
      const [automation, metrics, habits] = await Promise.all([
        api.reports.getAutomation(),
        api.metrics.list(),
        api.repetitiveTasks.list(),
      ]);

      return {
        automation,
        metricOptions: metrics.filter((metric) => metric.active),
        habitOptions: habits.filter((habit) => habit.status !== "archived"),
      };
    },
    [],
  );

  useEffect(() => {
    if (!data) return;
    setAutomationDraft(data.automation);
    setAutomationBaseline(data.automation);
    setMetricOptions(data.metricOptions);
    setHabitOptions(data.habitOptions);
  }, [data]);

  const automationDirty = useMemo(() => {
    if (!automationDraft || !automationBaseline) return false;
    return !sectionsEqual(automationDraft, automationBaseline);
  }, [automationBaseline, automationDraft]);

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
    if (!automationDraft || !automationDirty || saving) return;

    setSaving(true);
    try {
      const updated = await api.reports.updateAutomation(automationDraft);
      setAutomationDraft(updated);
      setAutomationBaseline(updated);
      toast.success("Automation flow updated.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save automation settings.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <LoadingState label="Loading automation settings..." />;
  }

  if (error) {
    return (
      <EmptyState
        icon={<GearFill size={22} />}
        title="Couldn't load automation settings"
        message={error}
        action={
          <button className="btn btn-brand" onClick={reload}>
            Retry
          </button>
        }
      />
    );
  }

  if (!automationDraft) {
    return <LoadingState label="Loading automation settings..." />;
  }

  return (
    <div>
      <PageHeader
        title="Automation"
        subtitle="Control report automation schedules and snapshots from one place."
        icon={<GearFill size={20} />}
        actions={
          <button
            type="button"
            className="btn btn-brand"
            onClick={saveAutomation}
            disabled={!automationDirty || saving}
          >
            {saving ? "Saving..." : "Save automation"}
          </button>
        }
      />

      <SectionCard>
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
        </div>
      </SectionCard>
    </div>
  );
}
