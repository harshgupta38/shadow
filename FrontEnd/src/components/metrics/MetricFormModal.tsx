import { useEffect, useRef, useState, type FormEvent } from "react";
import { Modal } from "react-bootstrap";
import { Stars } from "react-bootstrap-icons";

import { api, ApiError, type MetricTimeSpan, type TrackedMetric } from "@/api";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/context/ToastContext";
import { useAsync } from "@/hooks/useAsync";
import { METRIC_TIME_SPAN_LABEL } from "@/lib/labels";

interface MetricFormModalProps {
  show: boolean;
  metric?: TrackedMetric | null;
  onClose: () => void;
  onSaved: (metric: TrackedMetric, isNew: boolean) => void;
}

type MetricCreationMode = "shadow" | "manual";
const SHADOW_PROMPT_MAX_LINES = 5;
const TIME_SPAN_OPTIONS: MetricTimeSpan[] = ["day", "week", "month", "year", "custom"];

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

export function MetricFormModal({ show, metric, onClose, onSaved }: MetricFormModalProps) {
  const toast = useToast();
  const isEdit = !!metric;
  const habitsQuery = useAsync(
    () => (show ? api.repetitiveTasks.list("active") : Promise.resolve([])),
    [show],
  );

  const [creationMode, setCreationMode] = useState<MetricCreationMode>("shadow");
  const [shadowPrompt, setShadowPrompt] = useState("");
  const [shadowReady, setShadowReady] = useState(false);
  const [shadowBusy, setShadowBusy] = useState(false);
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [unitText, setUnitText] = useState("count");
  const [timeSpan, setTimeSpan] = useState<MetricTimeSpan>("day");
  const [timeSpanCustomText, setTimeSpanCustomText] = useState("");
  const [target, setTarget] = useState("");
  const [linkedHabitIds, setLinkedHabitIds] = useState<number[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const shadowPromptRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (show) {
      setLabel(metric?.label ?? "");
      setKey(metric?.key ?? "");
      setKeyTouched(false);
      setUnitText((metric?.unit_text ?? metric?.unit ?? "count").toString());
      setTimeSpan(metric?.time_span ?? "day");
      setTimeSpanCustomText(metric?.time_span_custom_text ?? "");
      setTarget(metric?.target != null ? String(metric.target) : "");
      setLinkedHabitIds(metric?.linked_habit_ids ?? []);
      setCreationMode(metric ? "manual" : "shadow");
      setShadowPrompt("");
      setShadowReady(!!metric);
      setShadowBusy(false);
      setFieldErrors({});
    }
  }, [show, metric]);

  // Auto-derive the key from the label until the user edits it directly.
  useEffect(() => {
    if (!isEdit && !keyTouched) setKey(slugify(label));
  }, [label, isEdit, keyTouched]);

  const fieldsLocked = !isEdit && creationMode === "shadow" && !shadowReady;
  const hasShadowPrompt = shadowPrompt.trim().length > 0;
  const submitLocked = busy || fieldsLocked;
  const selectedTimeSpanLabel =
    timeSpan === "custom"
      ? (timeSpanCustomText.trim() || "Custom")
      : METRIC_TIME_SPAN_LABEL[timeSpan];

  function autoResizeShadowPrompt() {
    const textarea = shadowPromptRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";

    const styles = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(styles.lineHeight || "") || 20;
    const paddingTop = Number.parseFloat(styles.paddingTop || "") || 0;
    const paddingBottom = Number.parseFloat(styles.paddingBottom || "") || 0;
    const borderTop = Number.parseFloat(styles.borderTopWidth || "") || 0;
    const borderBottom = Number.parseFloat(styles.borderBottomWidth || "") || 0;

    const maxHeight =
      lineHeight * SHADOW_PROMPT_MAX_LINES +
      paddingTop +
      paddingBottom +
      borderTop +
      borderBottom;

    const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${Math.ceil(nextHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }

  useEffect(() => {
    autoResizeShadowPrompt();
  }, [shadowPrompt, creationMode, show]);

  function toggleHabit(habitId: number) {
    setLinkedHabitIds((prev) =>
      prev.includes(habitId)
        ? prev.filter((entry) => entry !== habitId)
        : [...prev, habitId],
    );
  }

  async function handleShadowSetup() {
    const prompt = shadowPrompt.trim();
    if (!prompt) {
      setFieldErrors((prev) => ({ ...prev, shadow_prompt: "Tell Shadow what you want to track." }));
      return;
    }

    setShadowBusy(true);
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.shadow_prompt;
      return next;
    });

    try {
      const draft = await api.metrics.draft({ prompt });
      setLabel(draft.label?.trim() ?? "");
      setUnitText(draft.unit_text?.trim() ?? "count");
      setTimeSpan(draft.time_span ?? "day");
      setTimeSpanCustomText(draft.time_span_custom_text ?? "");
      setTarget(draft.target != null ? String(draft.target) : "");
      setShadowReady(true);
      toast.success("Shadow prepared your metric draft. You can edit anything before saving.");
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors((prev) => ({ ...prev, shadow_prompt: err.message }));
        toast.error(err.message);
      } else {
        const message = "Shadow couldn't structure this metric yet. Try rephrasing it.";
        setFieldErrors((prev) => ({ ...prev, shadow_prompt: message }));
        toast.error(message);
      }
    } finally {
      setShadowBusy(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!isEdit && creationMode === "shadow" && !shadowReady) {
      setFieldErrors((prev) => ({
        ...prev,
        shadow_prompt: "Ask Shadow to set this up first, or switch to Create manually.",
      }));
      return;
    }

    if (!label.trim()) {
      setFieldErrors({ label: "Give your metric a name." });
      return;
    }

    if (!unitText.trim()) {
      setFieldErrors({ unit_text: "Define what this metric measures (for example minutes, problems, km)." });
      return;
    }

    if (timeSpan === "custom" && !timeSpanCustomText.trim()) {
      setFieldErrors({ time_span_custom_text: "Add a label for your custom time span." });
      return;
    }

    const rawTarget = target.trim();
    if (rawTarget !== "" && Number.isNaN(Number(rawTarget))) {
      setFieldErrors({ target: "Target must be a number." });
      return;
    }

    setBusy(true);
    setFieldErrors({});
    const targetValue = rawTarget === "" ? null : Math.max(0, Math.round(Number(rawTarget)));

    const payload = {
      label: label.trim(),
      unit_text: unitText.trim(),
      time_span: timeSpan,
      time_span_custom_text: timeSpan === "custom" ? timeSpanCustomText.trim() : null,
      target: targetValue,
      linked_habit_ids: [...linkedHabitIds],
    };

    try {
      let saved: TrackedMetric;
      if (isEdit && metric) {
        saved = await api.metrics.update(metric.id, payload);
      } else {
        saved = await api.metrics.create({
          key: key || slugify(label),
          ...payload,
        });
      }
      toast.success(isEdit ? "Metric updated." : "Metric added.");
      onSaved(saved, !isEdit);
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
        if (err.fieldErrors) setFieldErrors(err.fieldErrors);
      } else {
        toast.error("Couldn't save the metric.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal show={show} onHide={onClose} centered size="lg" backdrop="static">
      <Modal.Header closeButton>
        <Modal.Title className="h5 fw-bold">{isEdit ? "Edit metric" : "New metric"}</Modal.Title>
      </Modal.Header>
      <form onSubmit={handleSubmit} autoComplete="off">
        <Modal.Body>
          {!isEdit && creationMode === "shadow" && (
            <div className="mb-3">
              <label htmlFor="metric-shadow-prompt" className="form-label">
                Tell Shadow what to track
              </label>
              <div className="goal-shadow-prompt-row d-flex gap-2">
                <textarea
                  ref={shadowPromptRef}
                  id="metric-shadow-prompt"
                  className={`form-control goal-shadow-prompt-input ${fieldErrors.shadow_prompt ? "is-invalid" : ""}`}
                  placeholder="e.g. I solve around 10 LeetCode problems every day"
                  value={shadowPrompt}
                  rows={1}
                  onChange={(e) => setShadowPrompt(e.target.value)}
                  disabled={busy || shadowBusy}
                  autoComplete="off"
                  autoFocus
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                      event.preventDefault();
                      void handleShadowSetup();
                    }
                  }}
                />
                {(hasShadowPrompt || shadowBusy) && (
                  <button
                    type="button"
                    className="btn btn-soft text-nowrap goal-shadow-refine-btn"
                    style={{ height: "stretch" }}
                    onClick={() => {
                      void handleShadowSetup();
                    }}
                    disabled={busy || shadowBusy}
                  >
                    <Stars size={14} className="me-1" />
                    {shadowBusy ? "Refining..." : "Refine"}
                  </button>
                )}
              </div>
              {fieldErrors.shadow_prompt && (
                <div className="text-danger small mt-1">{fieldErrors.shadow_prompt}</div>
              )}
            </div>
          )}

          {!fieldsLocked && (
            <>
              <TextField
                label="Name"
                name="label"
                placeholder="e.g. LeetCode solved"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                error={fieldErrors.label}
                autoFocus={!isEdit && creationMode === "manual"}
                required
                disabled={busy || shadowBusy}
              />

              {!isEdit && (
                <TextField
                  label="Key"
                  name="key"
                  placeholder="leetcode_solved"
                  value={key}
                  onChange={(e) => {
                    setKeyTouched(true);
                    setKey(e.target.value.toLowerCase());
                  }}
                  error={fieldErrors.key}
                  hint="Lowercase letters, numbers and underscores. Used for integrations later."
                  disabled={busy || shadowBusy}
                />
              )}

              <div className="row g-3">
                <div className="col-sm-6">
                  <TextField
                    label="Unit"
                    name="unit_text"
                    placeholder="e.g. minutes, hours, problems, km"
                    value={unitText}
                    onChange={(e) => setUnitText(e.target.value)}
                    error={fieldErrors.unit_text}
                    disabled={busy || shadowBusy}
                    required
                  />
                </div>
                <div className="col-sm-6">
                  <label htmlFor="metric-time-span" className="form-label">
                    Time span
                  </label>
                  <select
                    id="metric-time-span"
                    className="form-select"
                    value={timeSpan}
                    onChange={(e) => setTimeSpan(e.target.value as MetricTimeSpan)}
                    disabled={busy || shadowBusy}
                  >
                    {TIME_SPAN_OPTIONS.map((option) => (
                      <option value={option} key={option}>
                        {METRIC_TIME_SPAN_LABEL[option]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {timeSpan === "custom" && (
                <TextField
                  label="Custom time span"
                  name="time_span_custom_text"
                  placeholder="e.g. Sprint, Semester"
                  value={timeSpanCustomText}
                  onChange={(e) => setTimeSpanCustomText(e.target.value)}
                  error={fieldErrors.time_span_custom_text}
                  disabled={busy || shadowBusy}
                  required
                />
              )}

              <TextField
                label={`${selectedTimeSpanLabel} target (optional)`}
                name="target"
                type="number"
                min={0}
                placeholder="e.g. 10"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                error={fieldErrors.target}
                disabled={busy || shadowBusy}
              />

              <div>
                <label className="form-label">Linked habits (optional)</label>
                <div className="border rounded p-2" style={{ maxHeight: 180, overflowY: "auto" }}>
                  {habitsQuery.loading ? (
                    <div className="text-faint small">Loading habits...</div>
                  ) : habitsQuery.error ? (
                    <div className="text-danger small">{habitsQuery.error}</div>
                  ) : (habitsQuery.data ?? []).length === 0 ? (
                    <div className="text-faint small">No active habits available to link yet.</div>
                  ) : (
                    (habitsQuery.data ?? []).map((habit) => {
                      const checked = linkedHabitIds.includes(habit.id);
                      return (
                        <label
                          key={habit.id}
                          htmlFor={`metric-habit-${habit.id}`}
                          className="d-flex align-items-start gap-2 py-1"
                        >
                          <input
                            id={`metric-habit-${habit.id}`}
                            type="checkbox"
                            className="form-check-input mt-1"
                            checked={checked}
                            onChange={() => toggleHabit(habit.id)}
                            disabled={busy || shadowBusy}
                          />
                          <span>
                            <span className="fw-medium">{habit.name}</span>
                            {habit.description ? (
                              <span className="text-faint small d-block">{habit.description}</span>
                            ) : null}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
                <div className="text-faint small mt-1">
                  {linkedHabitIds.length} linked habit{linkedHabitIds.length === 1 ? "" : "s"}
                </div>
              </div>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <div className="goal-form-footer">
            {!isEdit && (
              <div className="nav-tabs-jv goal-form-mode-toggle">
                <button
                  type="button"
                  className={`nav-tab-jv ${creationMode === "shadow" ? "active" : ""}`}
                  onClick={() => {
                    setCreationMode("shadow");
                    setShadowReady(
                      !!(
                        label.trim() ||
                        unitText.trim() ||
                        target.trim() ||
                        linkedHabitIds.length > 0
                      ),
                    );
                  }}
                  disabled={busy || shadowBusy}
                >
                  Let Shadow Setup
                </button>
                <button
                  type="button"
                  className={`nav-tab-jv ${creationMode === "manual" ? "active" : ""}`}
                  onClick={() => {
                    setCreationMode("manual");
                    setShadowReady(true);
                  }}
                  disabled={busy || shadowBusy}
                >
                  Create manually
                </button>
              </div>
            )}

            <div className="goal-form-footer-actions">
              <button
                type="button"
                className="btn btn-outline-secondary goal-form-action-btn"
                onClick={onClose}
                disabled={busy || shadowBusy}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-brand goal-form-action-btn"
                disabled={submitLocked || shadowBusy}
              >
                {busy ? "Saving..." : isEdit ? "Save changes" : "Create metric"}
              </button>
            </div>
          </div>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
