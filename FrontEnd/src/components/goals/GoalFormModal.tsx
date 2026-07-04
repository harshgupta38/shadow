import { useEffect, useState, type FormEvent } from "react";
import { Modal } from "react-bootstrap";
import { Stars } from "react-bootstrap-icons";

import { api, ApiError, type Goal, type GoalStatus } from "@/api";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/context/ToastContext";
import { GOAL_CATEGORY_SUGGESTIONS, GOAL_STATUS_LABEL } from "@/lib/labels";

interface GoalFormModalProps {
  show: boolean;
  goal?: Goal | null;
  onClose: () => void;
  onSaved: (goal: Goal, isNew: boolean) => void;
}

/** Convert a stored datetime string to a `YYYY-MM-DD` value for date inputs. */
function toDateInput(value?: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}

const STATUS_OPTIONS: GoalStatus[] = ["active", "paused", "completed", "archived"];
type GoalCreationMode = "shadow" | "manual";

export function GoalFormModal({ show, goal, onClose, onSaved }: GoalFormModalProps) {
  const toast = useToast();
  const isEdit = !!goal;

  const [creationMode, setCreationMode] = useState<GoalCreationMode>("shadow");
  const [shadowPrompt, setShadowPrompt] = useState("");
  const [shadowReady, setShadowReady] = useState(false);
  const [shadowBusy, setShadowBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [status, setStatus] = useState<GoalStatus>("active");
  const [progress, setProgress] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (show) {
      setTitle(goal?.title ?? "");
      setDescription(goal?.description ?? "");
      setCategory(goal?.category ?? "");
      setTargetDate(toDateInput(goal?.target_date));
      setStatus(goal?.status ?? "active");
      setProgress(goal?.progress ?? 0);
      setCreationMode(goal ? "manual" : "shadow");
      setShadowPrompt("");
      setShadowReady(!!goal);
      setShadowBusy(false);
      setFieldErrors({});
    }
  }, [show, goal]);

  const fieldsLocked = !isEdit && creationMode === "shadow" && !shadowReady;
  const hasShadowPrompt = shadowPrompt.trim().length > 0;
  const submitLocked = busy || fieldsLocked;

  async function handleShadowSetup() {
    const prompt = shadowPrompt.trim();
    if (!prompt) {
      setFieldErrors((prev) => ({ ...prev, shadow_prompt: "Tell Shadow what you want to achieve." }));
      return;
    }

    setShadowBusy(true);
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.shadow_prompt;
      return next;
    });

    try {
      const draft = await api.goals.draft({ prompt });
      setTitle(draft.title?.trim() ?? "");
      setDescription(draft.description?.trim() ?? "");
      setCategory(draft.category?.trim() ?? "");
      setTargetDate(toDateInput(draft.target_date));
      setShadowReady(true);
      toast.success("Shadow prepared your goal draft. You can edit anything before saving.");
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors((prev) => ({
          ...prev,
          shadow_prompt: err.message,
        }));
        toast.error(err.message);
      } else {
        setFieldErrors((prev) => ({
          ...prev,
          shadow_prompt: "Shadow couldn't structure this yet. Try rephrasing your goal.",
        }));
        toast.error("Shadow couldn't structure this yet. Try rephrasing your goal.");
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
    if (!title.trim()) {
      setFieldErrors({ title: "Give your goal a title." });
      return;
    }
    setBusy(true);
    setFieldErrors({});
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      category: category.trim() || null,
      target_date: targetDate ? `${targetDate}T00:00:00` : null,
    };
    try {
      let saved: Goal;
      if (isEdit && goal) {
        saved = await api.goals.update(goal.id, {
          ...payload,
          status,
          progress,
        });
      } else {
        saved = await api.goals.create(payload);
      }
      toast.success(isEdit ? "Goal updated." : "Goal created.");
      onSaved(saved, !isEdit);
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
        if (err.fieldErrors) setFieldErrors(err.fieldErrors);
      } else {
        toast.error("Couldn't save the goal.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal show={show} onHide={onClose} centered size="lg">
      <Modal.Header closeButton>
        <Modal.Title className="h5 fw-bold">{isEdit ? "Edit goal" : "New goal"}</Modal.Title>
      </Modal.Header>
      <form onSubmit={handleSubmit} autoComplete="off">
        <Modal.Body>
          {!isEdit && creationMode === "shadow" && (
            <div className="mb-3">
              <label htmlFor="goal-shadow-prompt" className="form-label">
                Tell Shadow your goal idea
              </label>
              <div className="goal-shadow-prompt-row d-flex gap-2">
                <input
                  id="goal-shadow-prompt"
                  className={`form-control goal-shadow-prompt-input ${fieldErrors.shadow_prompt ? "is-invalid" : ""}`}
                  placeholder="e.g. I want to get an SDE job at Google"
                  value={shadowPrompt}
                  onChange={(e) => setShadowPrompt(e.target.value)}
                  disabled={busy || shadowBusy}
                  autoComplete="off"
                  autoFocus
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
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
                    onClick={() => void handleShadowSetup()}
                    disabled={busy || shadowBusy}
                  >
                    <Stars size={14} className="me-1" />
                    {shadowBusy ? "Refining…" : "Refine"}
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
                label="Title"
                name="title"
                placeholder="e.g. Become a senior engineer"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                error={fieldErrors.title}
                autoFocus={!isEdit && creationMode === "manual"}
                required
                disabled={busy || shadowBusy}
              />

              <div className="mb-3">
                <label htmlFor="goal-desc" className="form-label">
                  Description
                </label>
                <textarea
                  id="goal-desc"
                  className="form-control"
                  rows={3}
                  placeholder="What does success look like? Why does it matter?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={busy || shadowBusy}
                />
              </div>

              <div className="row g-3">
                <div className="col-sm-6">
                  <label htmlFor="goal-category" className="form-label">
                    Category
                  </label>
                  <input
                    id="goal-category"
                    className="form-control"
                    list="goal-categories"
                    placeholder="Career, Health…"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    disabled={busy || shadowBusy}
                  />
                  <datalist id="goal-categories">
                    {GOAL_CATEGORY_SUGGESTIONS.map((c) => (
                      <option value={c} key={c} />
                    ))}
                  </datalist>
                </div>
                <div className="col-sm-6">
                  <label htmlFor="goal-target" className="form-label">
                    Target date
                  </label>
                  <input
                    id="goal-target"
                    type="date"
                    className="form-control"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    disabled={busy || shadowBusy}
                  />
                </div>
              </div>
            </>
          )}

          {isEdit && (
            <div className="row g-3 mt-1">
              <div className="col-sm-6">
                <label htmlFor="goal-status" className="form-label">
                  Status
                </label>
                <select
                  id="goal-status"
                  className="form-select"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as GoalStatus)}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option value={s} key={s}>
                      {GOAL_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-sm-6">
                <label htmlFor="goal-progress" className="form-label">
                  Progress: {progress}%
                </label>
                <input
                  id="goal-progress"
                  type="range"
                  className="form-range mt-2"
                  min={0}
                  max={100}
                  step={5}
                  value={progress}
                  onChange={(e) => setProgress(Number(e.target.value))}
                />
              </div>
            </div>
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
                      !!(title.trim() || description.trim() || category.trim() || targetDate.trim()),
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
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-brand goal-form-action-btn"
                disabled={submitLocked || shadowBusy}
              >
                {busy ? "Saving…" : isEdit ? "Save changes" : "Create goal"}
              </button>
            </div>
          </div>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
