import { FormEvent, useMemo, useState } from "react";
import { Dropdown } from "react-bootstrap";
import {
  Archive,
  ArrowRepeat,
  PauseFill,
  PencilSquare,
  PlayFill,
  PlusLg,
  Stars,
  ThreeDotsVertical,
  Trash3,
} from "react-bootstrap-icons";

import {
  api,
  ApiError,
  type TrackedMetric,
  type RepetitiveTask,
  type RepetitiveTaskCreate,
  type RepetitiveTaskFrequency,
  type RepetitiveTaskPriority,
  type RepetitiveTaskRecommendation,
  type RepetitiveTaskStatus,
} from "@/api";
import { MetricFormModal, type MetricFormInitialValues } from "@/components/metrics/MetricFormModal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { SectionCard } from "@/components/ui/SectionCard";
import { useToast } from "@/context/ToastContext";
import { useAsync } from "@/hooks/useAsync";
import { formatDateTime } from "@/lib/format";

type PillVariant = "success" | "warn" | "danger" | "info" | "brand" | "muted";

interface RepetitiveTaskDraft {
  name: string;
  description: string;
  frequencies: RepetitiveTaskFrequency[];
  priority: RepetitiveTaskPriority;
  linked_goal_ids: number[];
  linked_metric_ids: number[];
}

interface FrequencyOption {
  value: RepetitiveTaskFrequency;
  label: string;
}

const FREQUENCY_OPTIONS: FrequencyOption[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "weekdays", label: "Weekdays" },
  { value: "weekends", label: "Weekends" },
  { value: "monday", label: "Mon" },
  { value: "tuesday", label: "Tue" },
  { value: "wednesday", label: "Wed" },
  { value: "thursday", label: "Thu" },
  { value: "friday", label: "Fri" },
  { value: "saturday", label: "Sat" },
  { value: "sunday", label: "Sun" },
  { value: "first_of_month", label: "First of month" },
  { value: "end_of_month", label: "End of month" },
];

const PRIORITY_LABEL: Record<RepetitiveTaskPriority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const PRIORITY_PILL: Record<RepetitiveTaskPriority, PillVariant> = {
  critical: "danger",
  high: "warn",
  medium: "info",
  low: "muted",
};

const STATUS_LABEL: Record<RepetitiveTaskStatus, string> = {
  active: "Active",
  paused: "Paused",
  archived: "Archived",
};

const STATUS_PILL: Record<RepetitiveTaskStatus, PillVariant> = {
  active: "success",
  paused: "warn",
  archived: "muted",
};

const EMPTY_DRAFT: RepetitiveTaskDraft = {
  name: "",
  description: "",
  frequencies: [],
  priority: "medium",
  linked_goal_ids: [],
  linked_metric_ids: [],
};

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function toCreatePayload(draft: RepetitiveTaskDraft): RepetitiveTaskCreate {
  return {
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    frequencies: [...draft.frequencies],
    priority: draft.priority,
    linked_goal_ids: [...draft.linked_goal_ids],
    linked_metric_ids: [...draft.linked_metric_ids],
  };
}

function toDraftFromSuggestion(suggestion: RepetitiveTaskRecommendation): RepetitiveTaskDraft {
  return {
    name: suggestion.name,
    description: suggestion.description,
    frequencies: [...suggestion.frequencies],
    priority: suggestion.priority,
    linked_goal_ids: [...suggestion.linked_goal_ids],
    linked_metric_ids: [...suggestion.linked_metric_ids],
  };
}

function toDraftFromTask(task: RepetitiveTask): RepetitiveTaskDraft {
  return {
    name: task.name,
    description: task.description ?? "",
    frequencies: [...task.frequencies],
    priority: task.priority,
    linked_goal_ids: [...task.linked_goal_ids],
    linked_metric_ids: [...task.linked_metric_ids],
  };
}

function orderTasks(left: RepetitiveTask, right: RepetitiveTask): number {
  const statusRank: Record<RepetitiveTaskStatus, number> = {
    active: 0,
    paused: 1,
    archived: 2,
  };

  const statusDiff = statusRank[left.status] - statusRank[right.status];
  if (statusDiff !== 0) return statusDiff;

  const timeDiff = Date.parse(right.updated_at) - Date.parse(left.updated_at);
  if (!Number.isNaN(timeDiff) && timeDiff !== 0) return timeDiff;

  return left.name.localeCompare(right.name);
}

function labelsForFrequencies(frequencies: RepetitiveTaskFrequency[]): string[] {
  return frequencies
    .map((frequency) => FREQUENCY_OPTIONS.find((option) => option.value === frequency)?.label)
    .filter((label): label is string => Boolean(label));
}

function metricDraftPromptForTask(task: RepetitiveTask): string {
  const description = task.description?.trim() || "None";
  const frequencies = task.frequencies.join(", ");

  return [
    "Create one measurable metric draft for this repetitive habit.",
    `Habit name: ${task.name}`,
    `Habit description: ${description}`,
    `Frequencies: ${frequencies}`,
    `Priority: ${task.priority}`,
    "Return the metric details only.",
  ].join("\n");
}

export function RepetitiveTasksPage() {
  const toast = useToast();
  const tasksQuery = useAsync(() => api.repetitiveTasks.list(), []);
  const recommendationsQuery = useAsync(() => api.repetitiveTasks.recommendations(), []);
  const goalsQuery = useAsync(() => api.goals.list("active"), []);
  const metricsQuery = useAsync(() => api.metrics.list(), []);

  const [draft, setDraft] = useState<RepetitiveTaskDraft>(EMPTY_DRAFT);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RepetitiveTask | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [statusTaskId, setStatusTaskId] = useState<number | null>(null);
  const [draftingMetricTaskId, setDraftingMetricTaskId] = useState<number | null>(null);
  const [metricTargetTaskId, setMetricTargetTaskId] = useState<number | null>(null);
  const [metricInitialValues, setMetricInitialValues] = useState<MetricFormInitialValues | null>(
    null,
  );
  const [showMetricModal, setShowMetricModal] = useState(false);
  const [statusFilters, setStatusFilters] = useState<RepetitiveTaskStatus[]>([]);
  const [priorityFilters, setPriorityFilters] = useState<RepetitiveTaskPriority[]>([]);
  const [goalFilterIds, setGoalFilterIds] = useState<number[]>([]);
  const [includeUnlinkedGoals, setIncludeUnlinkedGoals] = useState(false);
  const [frequencyFilters, setFrequencyFilters] = useState<RepetitiveTaskFrequency[]>([]);
  const [addSuggestionName, setAddSuggestionName] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const tasks = tasksQuery.data ?? [];
  const recommendations = recommendationsQuery.data ?? [];

  const activeCount = tasks.filter((task) => task.status === "active").length;
  const pausedCount = tasks.filter((task) => task.status === "paused").length;
  const archivedCount = tasks.filter((task) => task.status === "archived").length;
  const hasGoalLinkageFilter = goalFilterIds.length > 0 || includeUnlinkedGoals;

  const orderedTasks = useMemo(() => [...tasks].sort(orderTasks), [tasks]);
  const filteredTasks = useMemo(
    () =>
      orderedTasks.filter(
        (task) =>
          (statusFilters.length === 0 || statusFilters.includes(task.status)) &&
          (priorityFilters.length === 0 || priorityFilters.includes(task.priority)) &&
          (!hasGoalLinkageFilter ||
            (includeUnlinkedGoals && task.linked_goal_ids.length === 0) ||
            task.linked_goal_ids.some((goalId) => goalFilterIds.includes(goalId))) &&
          (frequencyFilters.length === 0 ||
            task.frequencies.some((frequency) => frequencyFilters.includes(frequency))),
      ),
    [
      orderedTasks,
      statusFilters,
      priorityFilters,
      hasGoalLinkageFilter,
      includeUnlinkedGoals,
      goalFilterIds,
      frequencyFilters,
    ],
  );
  const activeFilterCount =
    (statusFilters.length > 0 ? 1 : 0) +
    (priorityFilters.length > 0 ? 1 : 0) +
    (hasGoalLinkageFilter ? 1 : 0) +
    (frequencyFilters.length > 0 ? 1 : 0);

  const goalTitleById = useMemo(
    () => new Map((goalsQuery.data ?? []).map((goal) => [goal.id, goal.title])),
    [goalsQuery.data],
  );

  const metricLabelById = useMemo(
    () => new Map((metricsQuery.data ?? []).map((metric) => [metric.id, metric.label])),
    [metricsQuery.data],
  );

  const selectedGoalLabels = useMemo(() => {
    const goals = goalsQuery.data ?? [];
    if (goals.length === 0) return [] as string[];

    return draft.linked_goal_ids
      .map((goalId) => goals.find((goal) => goal.id === goalId)?.title)
      .filter((title): title is string => Boolean(title));
  }, [draft.linked_goal_ids, goalsQuery.data]);

  const goalsDropdownLabel =
    selectedGoalLabels.length === 0
      ? "Select goals"
      : selectedGoalLabels.length === 1
        ? selectedGoalLabels[0]
        : `${selectedGoalLabels.length} goals selected`;

  const selectedMetricLabels = useMemo(() => {
    const metrics = metricsQuery.data ?? [];
    if (metrics.length === 0) return [] as string[];

    return draft.linked_metric_ids
      .map((metricId) => metrics.find((metric) => metric.id === metricId)?.label)
      .filter((label): label is string => Boolean(label));
  }, [draft.linked_metric_ids, metricsQuery.data]);

  const metricsDropdownLabel =
    selectedMetricLabels.length === 0
      ? "Select metrics"
      : selectedMetricLabels.length === 1
        ? selectedMetricLabels[0]
        : `${selectedMetricLabels.length} metrics selected`;

  function resetDraft() {
    setDraft(EMPTY_DRAFT);
    setEditingTaskId(null);
    setFormError(null);
  }

  function resetLibraryFilters() {
    setStatusFilters([]);
    setPriorityFilters([]);
    setGoalFilterIds([]);
    setIncludeUnlinkedGoals(false);
    setFrequencyFilters([]);
  }

  function toggleStatusFilter(value: RepetitiveTaskStatus) {
    setStatusFilters((prev) =>
      prev.includes(value) ? prev.filter((entry) => entry !== value) : [...prev, value],
    );
  }

  function togglePriorityFilter(value: RepetitiveTaskPriority) {
    setPriorityFilters((prev) =>
      prev.includes(value) ? prev.filter((entry) => entry !== value) : [...prev, value],
    );
  }

  function toggleGoalFilterId(value: number) {
    setGoalFilterIds((prev) =>
      prev.includes(value) ? prev.filter((entry) => entry !== value) : [...prev, value],
    );
  }

  function toggleUnlinkedGoalsFilter() {
    setIncludeUnlinkedGoals((prev) => !prev);
  }

  function toggleFrequencyFilter(value: RepetitiveTaskFrequency) {
    setFrequencyFilters((prev) =>
      prev.includes(value) ? prev.filter((entry) => entry !== value) : [...prev, value],
    );
  }

  function toggleFrequency(frequency: RepetitiveTaskFrequency) {
    setDraft((prev) => {
      const exists = prev.frequencies.includes(frequency);
      return {
        ...prev,
        frequencies: exists
          ? prev.frequencies.filter((entry) => entry !== frequency)
          : [...prev.frequencies, frequency],
      };
    });
  }

  async function updateStatus(task: RepetitiveTask, status: RepetitiveTaskStatus) {
    if (task.status === status) return;

    setStatusTaskId(task.id);
    tasksQuery.setData((prev) =>
      (prev ?? []).map((entry) =>
        entry.id === task.id
          ? {
              ...entry,
              status,
              updated_at: new Date().toISOString(),
            }
          : entry,
      ),
    );

    try {
      const updated = await api.repetitiveTasks.update(task.id, { status });
      tasksQuery.setData((prev) =>
        (prev ?? []).map((entry) => (entry.id === task.id ? updated : entry)),
      );
    } catch (err) {
      tasksQuery.reload();
      toast.error(err instanceof ApiError ? err.message : "Couldn't update this repetitive task.");
    } finally {
      setStatusTaskId(null);
    }
  }

  function startEditing(task: RepetitiveTask) {
    setDraft(toDraftFromTask(task));
    setEditingTaskId(task.id);
    setFormError(null);
    if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
      try {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch {
        // Ignore environments where programmatic scrolling is not supported.
      }
    }
  }

  function startDuplicating(task: RepetitiveTask) {
    setDraft(toDraftFromTask(task));
    // Keep form prefilled, but force create mode so save creates a new task.
    setEditingTaskId(null);
    setFormError(null);
    if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
      try {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch {
        // Ignore environments where programmatic scrolling is not supported.
      }
    }
  }

  function closeMetricModal() {
    setShowMetricModal(false);
    setMetricInitialValues(null);
    setMetricTargetTaskId(null);
  }

  function handleMetricSaved(metric: TrackedMetric) {
    metricsQuery.setData((prev) => {
      const list = prev ?? [];
      const existing = list.find((entry) => entry.id === metric.id);
      if (!existing) return [metric, ...list];
      return list.map((entry) => (entry.id === metric.id ? metric : entry));
    });

    if (metricTargetTaskId !== null) {
      tasksQuery.setData((prev) =>
        (prev ?? []).map((entry) => {
          if (entry.id !== metricTargetTaskId) return entry;
          if (entry.linked_metric_ids.includes(metric.id)) {
            return {
              ...entry,
              updated_at: new Date().toISOString(),
            };
          }
          return {
            ...entry,
            linked_metric_ids: [...entry.linked_metric_ids, metric.id],
            updated_at: new Date().toISOString(),
          };
        }),
      );
    }
  }

  async function createMetricDraftForTask(task: RepetitiveTask) {
    setDraftingMetricTaskId(task.id);
    try {
      const draft = await api.metrics.draft({
        prompt: metricDraftPromptForTask(task),
      });
      setMetricTargetTaskId(task.id);
      setMetricInitialValues({
        label: draft.label,
        unitText: draft.unit_text,
        timeSpan: draft.time_span,
        timeSpanCustomText: draft.time_span_custom_text,
        target: draft.target,
        linkedHabitIds: [task.id],
      });
      setShowMetricModal(true);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't draft a metric for this habit.");
    } finally {
      setDraftingMetricTaskId(null);
    }
  }

  async function submitDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = draft.name.trim();
    if (!name) {
      setFormError("Task name is required.");
      return;
    }
    if (draft.frequencies.length === 0) {
      setFormError("Select at least one frequency.");
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const payload = toCreatePayload({ ...draft, name });

      if (editingTaskId !== null) {
        const updated = await api.repetitiveTasks.update(editingTaskId, payload);
        tasksQuery.setData((prev) =>
          (prev ?? []).map((task) => (task.id === editingTaskId ? updated : task)),
        );
      } else {
        const created = await api.repetitiveTasks.create(payload);
        tasksQuery.setData((prev) => [created, ...(prev ?? [])]);
        recommendationsQuery.setData((prev) =>
          (prev ?? []).filter((item) => normalizeName(item.name) !== normalizeName(created.name)),
        );
      }

      resetDraft();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Couldn't save this repetitive task.");
    } finally {
      setSubmitting(false);
    }
  }

  async function addSuggestionImmediately(suggestion: RepetitiveTaskRecommendation) {
    setAddSuggestionName(suggestion.name);
    try {
      const created = await api.repetitiveTasks.create({
        name: suggestion.name,
        description: suggestion.description,
        frequencies: [...suggestion.frequencies],
        priority: suggestion.priority,
        linked_goal_ids: [...suggestion.linked_goal_ids],
        linked_metric_ids: [...suggestion.linked_metric_ids],
      });

      tasksQuery.setData((prev) => [created, ...(prev ?? [])]);
      recommendationsQuery.setData((prev) =>
        (prev ?? []).filter((item) => normalizeName(item.name) !== normalizeName(suggestion.name)),
      );
      setFormError(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't add this recommendation.");
    } finally {
      setAddSuggestionName(null);
    }
  }

  async function deleteTask() {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      await api.repetitiveTasks.remove(deleteTarget.id);
      tasksQuery.setData((prev) => (prev ?? []).filter((task) => task.id !== deleteTarget.id));
      setDeleteTarget(null);

      if (editingTaskId === deleteTarget.id) {
        resetDraft();
      }

      recommendationsQuery.reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't delete this repetitive task.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Habit Library"
        subtitle="Create recurring commitments once, then keep them visible every day."
        icon={<ArrowRepeat size={20} />}
      />

      <div className="row g-4 mb-4">
        <div className="col-lg-8">
          <section className="surface p-4">
            <h2 className="h5 fw-bold mb-1">Habit Library Overview</h2>
            <p className="text-muted-2 mb-3">
              Tasks and recommendations are now powered by your Goal Coach.
            </p>
            <div className="d-flex flex-wrap gap-2">
              <Pill variant="success">{activeCount} Active</Pill>
              <Pill variant="warn">{pausedCount} Paused</Pill>
              <Pill variant="muted">{archivedCount} Archived</Pill>
              <Pill variant="brand">{tasks.length} Total</Pill>
            </div>
          </section>
        </div>
        <div className="col-lg-4">
          <section className="surface-2 h-100 p-4">
            <h2 className="h6 fw-bold mb-2">Lifecycle Actions</h2>
            <p className="small text-muted-2 mb-0">
              Edit, pause, resume, archive, and delete remain available with server persistence.
            </p>
          </section>
        </div>
      </div>

      <div className="row g-4">
        <div className="col-xl-5 d-flex flex-column gap-4">
          <SectionCard
            title={editingTaskId ? "Edit repetitive task" : "Create repetitive task"}
            subtitle="Define what should repeat and why it matters."
          >
            <form onSubmit={submitDraft} className="d-flex flex-column gap-3" autoComplete="off">
              <div>
                <label className="form-label" htmlFor="repetitive-task-name">
                  Task name
                </label>
                <input
                  id="repetitive-task-name"
                  className="form-control"
                  placeholder="Workout, LeetCode practice, Reading..."
                  autoComplete="off"
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      name: event.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <span className="form-label d-block mb-2">Frequency</span>
                <div className="d-flex flex-wrap gap-2">
                  {FREQUENCY_OPTIONS.map((option) => {
                    const selected = draft.frequencies.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={`btn btn-sm ${selected ? "btn-brand" : "btn-outline-secondary"}`}
                        onClick={() => toggleFrequency(option.value)}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="form-label" htmlFor="repetitive-task-priority">
                  Priority
                </label>
                <select
                  id="repetitive-task-priority"
                  className="form-select"
                  value={draft.priority}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      priority: event.target.value as RepetitiveTaskPriority,
                    }))
                  }
                >
                  {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label" htmlFor="repetitive-task-description">
                  Description
                </label>
                <textarea
                  id="repetitive-task-description"
                  className="form-control"
                  rows={3}
                  placeholder="Explain the purpose so future planning can use this context."
                  value={draft.description}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      description: event.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label className="form-label" htmlFor="repetitive-task-goals">
                  Link goals (optional)
                </label>
                {goalsQuery.loading && <LoadingState full={false} label="Loading goals..." />}
                {!goalsQuery.loading && (goalsQuery.data?.length ?? 0) === 0 && (
                  <div className="form-text">No active goals yet. You can link later.</div>
                )}
                {!goalsQuery.loading && (goalsQuery.data?.length ?? 0) > 0 && (
                  <>
                    <Dropdown autoClose="outside">
                      <Dropdown.Toggle
                        as="button"
                        type="button"
                        id="repetitive-task-goals"
                        className="form-select text-start d-flex justify-content-between align-items-center"
                      >
                        <span className="text-truncate pe-2">{goalsDropdownLabel}</span>
                      </Dropdown.Toggle>

                      <Dropdown.Menu className="w-100" style={{ maxHeight: 240, overflowY: "auto" }}>
                        {(goalsQuery.data ?? []).map((goal) => {
                          const selected = draft.linked_goal_ids.includes(goal.id);

                          return (
                            <button
                              key={goal.id}
                              type="button"
                              className="dropdown-item d-flex align-items-center gap-2"
                              onClick={() => {
                                setDraft((prev) => ({
                                  ...prev,
                                  linked_goal_ids: selected
                                    ? prev.linked_goal_ids.filter((id) => id !== goal.id)
                                    : [...prev.linked_goal_ids, goal.id],
                                }));
                              }}
                            >
                              <input
                                type="checkbox"
                                className="form-check-input mt-0"
                                checked={selected}
                                readOnly
                                tabIndex={-1}
                              />
                              <span className="text-wrap">{goal.title}</span>
                            </button>
                          );
                        })}
                      </Dropdown.Menu>
                    </Dropdown>

                    {selectedGoalLabels.length > 0 && (
                      <div className="form-text">Selected: {selectedGoalLabels.join(", ")}</div>
                    )}
                  </>
                )}
                {goalsQuery.error && <div className="form-text text-danger">{goalsQuery.error}</div>}
              </div>

              <div>
                <label className="form-label" htmlFor="repetitive-task-metrics">
                  Link metrics (optional)
                </label>
                {metricsQuery.loading && <LoadingState full={false} label="Loading metrics..." />}
                {!metricsQuery.loading && (metricsQuery.data?.length ?? 0) === 0 && (
                  <div className="form-text">No metrics yet. You can link later.</div>
                )}
                {!metricsQuery.loading && (metricsQuery.data?.length ?? 0) > 0 && (
                  <>
                    <Dropdown autoClose="outside">
                      <Dropdown.Toggle
                        as="button"
                        type="button"
                        id="repetitive-task-metrics"
                        className="form-select text-start d-flex justify-content-between align-items-center"
                      >
                        <span className="text-truncate pe-2">{metricsDropdownLabel}</span>
                      </Dropdown.Toggle>

                      <Dropdown.Menu className="w-100" style={{ maxHeight: 240, overflowY: "auto" }}>
                        {(metricsQuery.data ?? []).map((metric) => {
                          const selected = draft.linked_metric_ids.includes(metric.id);

                          return (
                            <button
                              key={metric.id}
                              type="button"
                              className="dropdown-item d-flex align-items-center gap-2"
                              onClick={() => {
                                setDraft((prev) => ({
                                  ...prev,
                                  linked_metric_ids: selected
                                    ? prev.linked_metric_ids.filter((id) => id !== metric.id)
                                    : [...prev.linked_metric_ids, metric.id],
                                }));
                              }}
                            >
                              <input
                                type="checkbox"
                                className="form-check-input mt-0"
                                checked={selected}
                                readOnly
                                tabIndex={-1}
                              />
                              <span className="text-wrap">{metric.label}</span>
                            </button>
                          );
                        })}
                      </Dropdown.Menu>
                    </Dropdown>

                    {selectedMetricLabels.length > 0 && (
                      <div className="form-text">Selected: {selectedMetricLabels.join(", ")}</div>
                    )}
                  </>
                )}
                {metricsQuery.error && <div className="form-text text-danger">{metricsQuery.error}</div>}
              </div>

              {formError && <div className="small text-danger">{formError}</div>}

              <div className="d-flex gap-2">
                <button type="submit" className="btn btn-brand" disabled={submitting}>
                  <PlusLg size={14} className="me-1" />
                  {editingTaskId ? "Update repetitive task" : "Create repetitive task"}
                </button>
                {!editingTaskId && (
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={resetDraft}
                    disabled={submitting}
                  >
                    Clear
                  </button>
                )}
                {editingTaskId && (
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={resetDraft}
                    disabled={submitting}
                  >
                    Cancel edit
                  </button>
                )}
              </div>
            </form>
          </SectionCard>

          <SectionCard
            title="AI recommendations"
            subtitle="API-backed suggestions based on your current goals and metrics."
            actions={<Pill variant="brand" className="text-nowrap">Live API</Pill>}
          >
            {recommendationsQuery.loading ? (
              <LoadingState full={false} label="Loading recommendations..." />
            ) : recommendationsQuery.error ? (
              <div className="small text-danger">{recommendationsQuery.error}</div>
            ) : recommendations.length === 0 ? (
              <EmptyState
                compact
                icon={<Stars size={20} />}
                title="No suggestions right now"
                message="As your goals and metrics evolve, fresh recommendations will appear here."
              />
            ) : (
              <div className="d-flex flex-column gap-2">
                {recommendations.map((suggestion) => {
                  const addingNow = addSuggestionName === suggestion.name;
                  return (
                    <div key={suggestion.name} className="surface-2 p-3">
                      <div className="d-flex align-items-start justify-content-between gap-2 mb-2">
                        <div>
                          <div className="fw-semibold">{suggestion.name}</div>
                          <div className="small text-muted-2">{suggestion.rationale}</div>
                        </div>
                        <Stars size={16} className="text-faint flex-shrink-0" />
                      </div>

                      <div className="d-flex flex-wrap gap-2 mb-2">
                        <Pill variant={PRIORITY_PILL[suggestion.priority]}>
                          {PRIORITY_LABEL[suggestion.priority]}
                        </Pill>
                        {labelsForFrequencies(suggestion.frequencies).map((label) => (
                          <Pill key={`${suggestion.name}-${label}`}>{label}</Pill>
                        ))}
                      </div>

                      <div className="d-flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn btn-soft btn-sm"
                          onClick={() => {
                            setDraft(toDraftFromSuggestion(suggestion));
                            setEditingTaskId(null);
                            setFormError(null);
                          }}
                          disabled={addingNow}
                        >
                          Use in form
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-secondary btn-sm"
                          onClick={() => void addSuggestionImmediately(suggestion)}
                          disabled={addingNow}
                        >
                          {addingNow ? "Adding..." : "Add now"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>

        <div className="col-xl-7">
          <SectionCard
            title="Habit library"
            subtitle="Your repetitive tasks and current lifecycle status."
            actions={
              <Dropdown align="end" autoClose="outside">
                <Dropdown.Toggle
                  as="button"
                  type="button"
                  className="btn btn-sm btn-outline-secondary rounded-pill px-3"
                  aria-label="Open task filters"
                >
                  Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
                </Dropdown.Toggle>
                <Dropdown.Menu
                  className="repetitive-task-filter-menu"
                  data-testid="repetitive-task-filter-menu"
                >
                  <div className="px-2 pb-1 small fw-semibold text-faint">Status</div>
                  <div className="px-2 pb-1 d-flex flex-wrap gap-2">
                    {(Object.entries(STATUS_LABEL) as Array<[RepetitiveTaskStatus, string]>).map(
                      ([value, label]) => {
                        const selected = statusFilters.includes(value);
                        return (
                          <button
                            key={value}
                            type="button"
                            className={`btn btn-sm ${selected ? "btn-brand" : "btn-outline-secondary"}`}
                            aria-label={`Status filter ${label}`}
                            onClick={() => toggleStatusFilter(value)}
                          >
                            {label}
                          </button>
                        );
                      },
                    )}
                  </div>

                  <div className="dropdown-divider my-1" />
                  <div className="px-2 pb-1 small fw-semibold text-faint">Priority</div>
                  <div className="px-2 pb-1 d-flex flex-wrap gap-2">
                    {(Object.entries(PRIORITY_LABEL) as Array<[RepetitiveTaskPriority, string]>).map(
                      ([value, label]) => {
                        const selected = priorityFilters.includes(value);
                        return (
                          <button
                            key={value}
                            type="button"
                            className={`btn btn-sm ${selected ? "btn-brand" : "btn-outline-secondary"}`}
                            aria-label={`Priority filter ${label}`}
                            onClick={() => togglePriorityFilter(value)}
                          >
                            {label}
                          </button>
                        );
                      },
                    )}
                  </div>

                  <div className="dropdown-divider my-1" />
                  <div className="px-2 pb-1 small fw-semibold text-faint">Goal linkage</div>
                  <div className="px-2 pb-1 d-flex flex-wrap gap-2">
                    {(goalsQuery.data ?? []).map((goal) => {
                      const selected = goalFilterIds.includes(goal.id);
                      return (
                        <button
                          key={goal.id}
                          type="button"
                          className={`btn btn-sm ${selected ? "btn-brand" : "btn-outline-secondary"}`}
                          aria-label={`Goal linkage filter ${goal.title}`}
                          onClick={() => toggleGoalFilterId(goal.id)}
                        >
                          {goal.title}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      className={`btn btn-sm ${includeUnlinkedGoals ? "btn-brand" : "btn-outline-secondary"}`}
                      aria-label="Goal linkage filter Not linked to goals"
                      onClick={toggleUnlinkedGoalsFilter}
                    >
                      Not linked to goals
                    </button>
                    {!goalsQuery.loading && (goalsQuery.data?.length ?? 0) === 0 && (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        disabled
                        aria-label="No active goals available"
                      >
                        No active goals
                      </button>
                    )}
                  </div>

                  <div className="dropdown-divider my-1" />
                  <div className="px-2 pb-1 small fw-semibold text-faint">Frequency</div>
                  <div className="px-2 pb-1 d-flex flex-wrap gap-2">
                    {FREQUENCY_OPTIONS.map((option) => {
                      const selected = frequencyFilters.includes(option.value);
                      return (
                        <button
                          key={option.value}
                          type="button"
                          className={`btn btn-sm ${selected ? "btn-brand" : "btn-outline-secondary"}`}
                          aria-label={`Frequency filter ${option.label}`}
                          onClick={() => toggleFrequencyFilter(option.value)}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="dropdown-divider my-1" />
                  <div className="px-2 pt-1">
                    <button
                      type="button"
                      className="btn btn-soft btn-sm w-100"
                      onClick={resetLibraryFilters}
                      disabled={activeFilterCount === 0}
                    >
                      Reset filters
                    </button>
                  </div>
                </Dropdown.Menu>
              </Dropdown>
            }
          >
            {tasksQuery.loading ? (
              <LoadingState full={false} label="Loading repetitive tasks..." />
            ) : tasksQuery.error ? (
              <EmptyState
                compact
                icon={<ArrowRepeat size={22} />}
                title="Couldn't load repetitive tasks"
                message={tasksQuery.error}
                action={
                  <button type="button" className="btn btn-brand btn-sm" onClick={tasksQuery.reload}>
                    Retry
                  </button>
                }
              />
            ) : orderedTasks.length === 0 ? (
              <EmptyState
                compact
                icon={<ArrowRepeat size={22} />}
                title="No repetitive tasks yet"
                message="Create your first recurring commitment to build daily consistency."
              />
            ) : filteredTasks.length === 0 ? (
              <EmptyState
                compact
                icon={<ArrowRepeat size={22} />}
                title="No tasks match selected filters"
                message="Try resetting one or more filters."
              />
            ) : (
              <div className="d-flex flex-column gap-3">
                {filteredTasks.map((task) => {
                  const frequencyLabels = labelsForFrequencies(task.frequencies);
                  const goalLabels = task.linked_goal_ids.map(
                    (goalId) => goalTitleById.get(goalId) ?? `Goal #${goalId}`,
                  );
                  const metricLabels = task.linked_metric_ids.map(
                    (metricId) => metricLabelById.get(metricId) ?? `Metric #${metricId}`,
                  );
                  const statusBusy = statusTaskId === task.id;
                  const metricDraftBusy = draftingMetricTaskId === task.id;
                  const showFrequencyInFooter = frequencyLabels.length < 4;

                  return (
                    <article
                      key={task.id}
                      data-testid={`repetitive-task-${task.id}`}
                      className="surface-2 p-3"
                    >
                      <div className="d-flex flex-wrap align-items-start justify-content-between gap-2">
                        <div>
                          <h3 className="h6 fw-bold mb-0">{task.name}</h3>
                        </div>

                        <Dropdown align="end">
                          <Dropdown.Toggle
                            as="button"
                            type="button"
                            className="btn btn-ghost btn-sm px-2"
                            id={`repetitive-task-actions-${task.id}`}
                            aria-label={`Open actions for ${task.name}`}
                            disabled={statusBusy}
                          >
                            <ThreeDotsVertical size={16} />
                          </Dropdown.Toggle>

                          <Dropdown.Menu>
                            <button
                              type="button"
                              className="dropdown-item d-flex align-items-center gap-2"
                              onClick={() => startEditing(task)}
                              aria-label={`Edit ${task.name}`}
                            >
                              <PencilSquare size={14} />
                              <span>Edit</span>
                            </button>

                            <button
                              type="button"
                              className="dropdown-item d-flex align-items-center gap-2"
                              onClick={() => {
                                void createMetricDraftForTask(task);
                              }}
                              aria-label={`Create metric for ${task.name}`}
                              disabled={metricDraftBusy}
                            >
                              <Stars size={14} />
                              <span>{metricDraftBusy ? "Creating metric..." : "Create metric"}</span>
                            </button>

                            <button
                              type="button"
                              className="dropdown-item d-flex align-items-center gap-2"
                              onClick={() => startDuplicating(task)}
                              aria-label={`Duplicate ${task.name}`}
                            >
                              <PlusLg size={14} />
                              <span>Duplicate</span>
                            </button>

                            {task.status === "active" && (
                              <button
                                type="button"
                                className="dropdown-item d-flex align-items-center gap-2"
                                onClick={() => void updateStatus(task, "paused")}
                                aria-label={`Pause ${task.name}`}
                              >
                                <PauseFill size={14} />
                                <span>Pause</span>
                              </button>
                            )}

                            {task.status === "paused" && (
                              <button
                                type="button"
                                className="dropdown-item d-flex align-items-center gap-2"
                                onClick={() => void updateStatus(task, "active")}
                                aria-label={`Resume ${task.name}`}
                              >
                                <PlayFill size={14} />
                                <span>Resume</span>
                              </button>
                            )}

                            {task.status !== "archived" && (
                              <button
                                type="button"
                                className="dropdown-item d-flex align-items-center gap-2"
                                onClick={() => void updateStatus(task, "archived")}
                                aria-label={`Archive ${task.name}`}
                              >
                                <Archive size={14} />
                                <span>Archive</span>
                              </button>
                            )}

                            {task.status === "archived" && (
                              <button
                                type="button"
                                className="dropdown-item d-flex align-items-center gap-2"
                                onClick={() => void updateStatus(task, "active")}
                                aria-label={`Restore ${task.name}`}
                              >
                                <PlayFill size={14} />
                                <span>Restore</span>
                              </button>
                            )}

                            <button
                              type="button"
                              className="dropdown-item text-danger d-flex align-items-center gap-2"
                              onClick={() => setDeleteTarget(task)}
                              aria-label={`Delete ${task.name}`}
                            >
                              <Trash3 size={14} />
                              <span>Delete</span>
                            </button>
                          </Dropdown.Menu>
                        </Dropdown>
                      </div>

                      {task.description && <p className="small text-muted-2 mb-1">{task.description}</p>}

                      {!showFrequencyInFooter && (
                        <div className="d-flex flex-wrap gap-2 mb-2">
                          {frequencyLabels.map((label) => (
                            <Pill key={`${task.id}-${label}`}>{label}</Pill>
                          ))}
                        </div>
                      )}

                      {(goalLabels.length > 0 || metricLabels.length > 0) && (
                        <div className="small text-muted-2">
                          {goalLabels.length > 0 && <div>Goals: {goalLabels.join(", ")}</div>}
                          {metricLabels.length > 0 && <div>Metrics: {metricLabels.join(", ")}</div>}
                        </div>
                      )}

                      <div className="d-flex align-items-center justify-content-between gap-2 mt-2">
                        <div className="d-flex flex-wrap gap-2">
                          <Pill variant={STATUS_PILL[task.status]} dot>
                            {STATUS_LABEL[task.status]}
                          </Pill>
                          <Pill variant={PRIORITY_PILL[task.priority]}>
                            {PRIORITY_LABEL[task.priority]}
                          </Pill>
                          {showFrequencyInFooter &&
                            frequencyLabels.map((label) => (
                              <Pill key={`footer-${task.id}-${label}`}>{label}</Pill>
                            ))}
                        </div>
                        <div className="d-none d-md-block small text-faint text-nowrap">
                          {formatDateTime(task.updated_at)}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      <ConfirmDialog
        show={!!deleteTarget}
        title="Delete this repetitive task?"
        message={
          deleteTarget
            ? `"${deleteTarget.name}" will be removed from your repetitive task library.`
            : undefined
        }
        confirmLabel="Delete"
        destructive
        busy={deleting}
        onConfirm={() => {
          void deleteTask();
        }}
        onCancel={() => {
          if (deleting) return;
          setDeleteTarget(null);
        }}
      />

      <MetricFormModal
        show={showMetricModal}
        initialValues={metricInitialValues}
        onSaved={handleMetricSaved}
        onClose={closeMetricModal}
      />
    </div>
  );
}
