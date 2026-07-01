import { useEffect, useState, type FormEvent } from "react";
import { Modal } from "react-bootstrap";

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

export function GoalFormModal({ show, goal, onClose, onSaved }: GoalFormModalProps) {
  const toast = useToast();
  const isEdit = !!goal;

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
      setFieldErrors({});
    }
  }, [show, goal]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
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
      <form onSubmit={handleSubmit}>
        <Modal.Body>
          <TextField
            label="Title"
            name="title"
            placeholder="e.g. Become a senior engineer"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            error={fieldErrors.title}
            autoFocus
            required
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
              />
            </div>
          </div>

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
          <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-brand px-4" disabled={busy}>
            {busy ? "Saving…" : isEdit ? "Save changes" : "Create goal"}
          </button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
