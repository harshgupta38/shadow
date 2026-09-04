import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Modal } from "react-bootstrap";
import { Stars } from "react-bootstrap-icons";
import ReactQuill from "react-quill";

import {
  api,
  ApiError,
  type PlannedTask,
  type PlannedTaskPriority,
  type RepetitiveTask,
} from "@/api";
import { useToast } from "@/context/ToastContext";
import { useAsync } from "@/hooks/useAsync";
import { toISODate } from "@/lib/format";

interface ScheduleTaskModalProps {
  show: boolean;
  task?: PlannedTask | null;
  initialDate?: string;
  onClose: () => void;
  onSaved: (task: PlannedTask, isNew: boolean) => void;
}

type CreationMode = "automatic" | "manual";

const PRIORITY_OPTIONS: Array<{ value: PlannedTaskPriority; label: string }> = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const QUILL_MODULES = {
  toolbar: [
    [{ header: [3, false] }],
    ["bold", "italic", "underline"],
    [{ list: "ordered" }, { list: "bullet" }],
    ["blockquote"],
    ["link"],
    ["clean"],
  ],
};

const QUILL_FORMATS = ["header", "bold", "italic", "underline", "list", "bullet", "blockquote", "link"];

function toDateInput(value?: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}

function toEditorValue(value?: string | null): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed === "<p><br></p>") return "";
  if (/<\/?[a-z][\s\S]*>/i.test(trimmed)) return trimmed;
  const escaped = trimmed
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<p>${escaped.replace(/\r?\n/g, "</p><p>")}</p>`;
}

function normalizeEditorValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "<p><br></p>") return null;
  return trimmed;
}

export function ScheduleTaskModal({ show, task, initialDate, onClose, onSaved }: ScheduleTaskModalProps) {
  const toast = useToast();
  const isEdit = !!task;
  const today = toISODate();

  const goalsQuery = useAsync(() => api.goals.list("active"), []);
  const habitsQuery = useAsync(() => api.repetitiveTasks.list(), []);

  const [mode, setMode] = useState<CreationMode>("automatic");
  const [autoPrompt, setAutoPrompt] = useState("");
  const [autoReady, setAutoReady] = useState(false);
  const [autoBusy, setAutoBusy] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [taskDate, setTaskDate] = useState("");
  const [priority, setPriority] = useState<PlannedTaskPriority>("medium");
  const [linkedHabitId, setLinkedHabitId] = useState("");
  const [relatedGoalId, setRelatedGoalId] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const activeHabits = useMemo(
    () => (habitsQuery.data ?? []).filter((habit) => habit.status === "active"),
    [habitsQuery.data],
  );

  useEffect(() => {
    if (!show) return;

    setTitle(task?.title ?? "");
    setDescription(toEditorValue(task?.description));
    setTaskDate(toDateInput(task?.date) || toDateInput(initialDate) || today);
    setPriority(task?.priority ?? "medium");
    setLinkedHabitId(task?.linked_habit_id ? String(task.linked_habit_id) : "");
    setRelatedGoalId(task?.related_goal_id ? String(task.related_goal_id) : "");
    setMode(task ? "manual" : "automatic");
    setAutoPrompt("");
    setAutoReady(!!task);
    setAutoBusy(false);
    setSaving(false);
    setFieldError(null);
  }, [show, task, initialDate, today]);

  const fieldsLocked = !isEdit && mode === "automatic" && !autoReady;
  const hasPrompt = autoPrompt.trim().length > 0;
  const submitLocked = saving || autoBusy || fieldsLocked;
  const closeLocked = saving;

  function handleHabitSelect(nextHabitId: string) {
    setLinkedHabitId(nextHabitId);

    if (!nextHabitId || relatedGoalId) return;
    const selectedHabit = activeHabits.find((habit) => String(habit.id) === nextHabitId);
    if (!selectedHabit || selectedHabit.linked_goal_ids.length === 0) return;
    setRelatedGoalId(String(selectedHabit.linked_goal_ids[0]));
  }

  async function handleRefine() {
    const prompt = autoPrompt.trim();
    if (!prompt) {
      setFieldError("Describe what you want to plan first.");
      return;
    }

    setAutoBusy(true);
    setFieldError(null);
    try {
      const draft = await api.plan.draftScheduleTask({
        prompt,
        on_date: taskDate || today,
      });

      setTitle(draft.title);
      setDescription(toEditorValue(draft.description));
      setTaskDate(draft.date ?? taskDate ?? today);
      setPriority(draft.priority ?? "medium");
      setLinkedHabitId(draft.linked_habit_id ? String(draft.linked_habit_id) : "");
      setRelatedGoalId(draft.related_goal_id ? String(draft.related_goal_id) : "");
      setAutoReady(true);
      toast.success("Draft ready. Review and edit before saving.");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Shadow could not refine this task yet.";
      setFieldError(message);
      toast.error(message);
    } finally {
      setAutoBusy(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (fieldsLocked) {
      setFieldError("Click Refine in Automatic mode, or switch to Manual.");
      return;
    }

    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      setFieldError("Task title is required.");
      return;
    }
    if (!taskDate) {
      setFieldError("Date is required.");
      return;
    }
    if (taskDate < today) {
      setFieldError("Please choose today or a future date.");
      return;
    }

    setSaving(true);
    setFieldError(null);

    try {
      const payload = {
        title: normalizedTitle,
        description: normalizeEditorValue(description),
        date: taskDate,
        priority,
        source: "manual" as const,
        linked_habit_id: linkedHabitId ? Number(linkedHabitId) : null,
        related_goal_id: relatedGoalId ? Number(relatedGoalId) : null,
      };

      const saved = isEdit && task
        ? await api.plan.updateScheduled(task.id, payload)
        : await api.plan.createScheduled(payload);

      toast.success(isEdit ? "Scheduled task updated." : "Task scheduled.");
      onSaved(saved, !isEdit);
      onClose();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Couldn't save this scheduled task.";
      setFieldError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal show={show} onHide={closeLocked ? undefined : onClose} centered size="lg" backdrop="static">
      <Modal.Header closeButton={!closeLocked}>
        <Modal.Title className="h5 fw-bold">{isEdit ? "Edit scheduled task" : "Schedule a task"}</Modal.Title>
      </Modal.Header>

      <form onSubmit={handleSubmit} autoComplete="off">
        <Modal.Body>
          {!isEdit && (
            <div className="mb-3">
              <div className="nav-tabs-jv">
                <button
                  type="button"
                  className={`nav-tab-jv ${mode === "automatic" ? "active" : ""}`}
                  onClick={() => {
                    setMode("automatic");
                    setAutoReady(false);
                  }}
                  disabled={saving || autoBusy}
                >
                  Tell Shadow
                </button>
                <button
                  type="button"
                  className={`nav-tab-jv ${mode === "manual" ? "active" : ""}`}
                  onClick={() => {
                    setMode("manual");
                    setAutoReady(true);
                  }}
                  disabled={saving || autoBusy}
                >
                  Setup Manually
                </button>
              </div>
            </div>
          )}

          {!isEdit && mode === "automatic" && (
            <div className="mb-3">
              <label htmlFor="schedule-auto-prompt" className="form-label">
                Tell Shadow what you want to plan
              </label>
              <div className="d-flex gap-2 align-items-start">
                <textarea
                  id="schedule-auto-prompt"
                  className="form-control schedule-shadow-prompt-input"
                  rows={2}
                  placeholder="e.g. I want to meet Animesh on Friday"
                  value={autoPrompt}
                  onChange={(event) => setAutoPrompt(event.target.value)}
                  disabled={saving || autoBusy}
                />
                {(hasPrompt || autoBusy) && (
                  <button
                    type="button"
                    className="btn btn-soft text-nowrap"
                    onClick={() => {
                      void handleRefine();
                    }}
                    disabled={saving || autoBusy}
                  >
                    <Stars size={14} className="me-1" />
                    {autoBusy ? "Refining..." : "Refine"}
                  </button>
                )}
              </div>
            </div>
          )}

          {!fieldsLocked && (
            <>
              <div className="mb-3">
                <label className="form-label" htmlFor="schedule-title">
                  Title
                </label>
                <input
                  id="schedule-title"
                  className="form-control"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="What are you planning?"
                  maxLength={255}
                  required
                  disabled={saving || autoBusy}
                />
              </div>

              <div className="mb-3">
                <label className="form-label">Description</label>
                <ReactQuill
                  className="milestone-editor"
                  theme="snow"
                  value={description}
                  onChange={setDescription}
                  modules={QUILL_MODULES}
                  formats={QUILL_FORMATS}
                  readOnly={saving || autoBusy}
                  placeholder="Add details, context, and constraints..."
                />
              </div>

              <div className="row g-3">
                <div className="col-sm-6">
                  <label className="form-label" htmlFor="schedule-date">
                    Date
                  </label>
                  <input
                    id="schedule-date"
                    type="date"
                    className="form-control"
                    min={today}
                    value={taskDate}
                    onChange={(event) => setTaskDate(event.target.value)}
                    disabled={saving || autoBusy}
                    required
                  />
                </div>

                <div className="col-sm-6">
                  <label className="form-label" htmlFor="schedule-priority">
                    Priority
                  </label>
                  <select
                    id="schedule-priority"
                    className="form-select"
                    value={priority}
                    onChange={(event) => setPriority(event.target.value as PlannedTaskPriority)}
                    disabled={saving || autoBusy}
                  >
                    {PRIORITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-sm-6">
                  <label className="form-label" htmlFor="schedule-habit">
                    Linked habit
                  </label>
                  <select
                    id="schedule-habit"
                    className="form-select"
                    value={linkedHabitId}
                    onChange={(event) => handleHabitSelect(event.target.value)}
                    disabled={saving || autoBusy}
                  >
                    <option value="">No linked habit</option>
                    {activeHabits.map((habit: RepetitiveTask) => (
                      <option key={habit.id} value={habit.id}>
                        {habit.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-sm-6">
                  <label className="form-label" htmlFor="schedule-goal">
                    Linked goal
                  </label>
                  <select
                    id="schedule-goal"
                    className="form-select"
                    value={relatedGoalId}
                    onChange={(event) => setRelatedGoalId(event.target.value)}
                    disabled={saving || autoBusy}
                  >
                    <option value="">No linked goal</option>
                    {(goalsQuery.data ?? []).map((goal) => (
                      <option key={goal.id} value={goal.id}>
                        {goal.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          {fieldError && <div className="text-danger small mt-3">{fieldError}</div>}
        </Modal.Body>

        <Modal.Footer>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={closeLocked}>
            Cancel
          </button>
          <button type="submit" className="btn btn-brand" disabled={submitLocked}>
            {saving ? "Saving..." : isEdit ? "Save changes" : "Save task"}
          </button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
