import { useEffect, useState, type FormEvent } from "react";
import { Modal } from "react-bootstrap";

import { api, ApiError, type MetricUnit, type TrackedMetric } from "@/api";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/context/ToastContext";
import { METRIC_UNIT_LABEL } from "@/lib/labels";

interface MetricFormModalProps {
  show: boolean;
  metric?: TrackedMetric | null;
  onClose: () => void;
  onSaved: (metric: TrackedMetric, isNew: boolean) => void;
}

const UNIT_OPTIONS: MetricUnit[] = ["count", "minutes", "hours", "custom"];

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

  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [unit, setUnit] = useState<MetricUnit>("count");
  const [target, setTarget] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (show) {
      setLabel(metric?.label ?? "");
      setKey(metric?.key ?? "");
      setKeyTouched(false);
      setUnit(metric?.unit ?? "count");
      setTarget(metric?.target != null ? String(metric.target) : "");
      setFieldErrors({});
    }
  }, [show, metric]);

  // Auto-derive the key from the label until the user edits it directly.
  useEffect(() => {
    if (!isEdit && !keyTouched) setKey(slugify(label));
  }, [label, isEdit, keyTouched]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!label.trim()) {
      setFieldErrors({ label: "Give your metric a name." });
      return;
    }
    setBusy(true);
    setFieldErrors({});
    const targetValue = target.trim() === "" ? null : Math.max(0, Math.round(Number(target)));
    try {
      let saved: TrackedMetric;
      if (isEdit && metric) {
        saved = await api.metrics.update(metric.id, {
          label: label.trim(),
          unit,
          target: targetValue,
        });
      } else {
        saved = await api.metrics.create({
          key: key || slugify(label),
          label: label.trim(),
          unit,
          target: targetValue,
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
    <Modal show={show} onHide={onClose} centered backdrop="static">
      <Modal.Header closeButton>
        <Modal.Title className="h5 fw-bold">{isEdit ? "Edit metric" : "New metric"}</Modal.Title>
      </Modal.Header>
      <form onSubmit={handleSubmit}>
        <Modal.Body>
          <TextField
            label="Name"
            name="label"
            placeholder="e.g. LeetCode solved"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            error={fieldErrors.label}
            autoFocus
            required
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
            />
          )}

          <div className="row g-3">
            <div className="col-sm-6">
              <label htmlFor="metric-unit" className="form-label">
                Unit
              </label>
              <select
                id="metric-unit"
                className="form-select"
                value={unit}
                onChange={(e) => setUnit(e.target.value as MetricUnit)}
              >
                {UNIT_OPTIONS.map((u) => (
                  <option value={u} key={u}>
                    {METRIC_UNIT_LABEL[u]}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-sm-6">
              <TextField
                label="Daily target (optional)"
                name="target"
                type="number"
                min={0}
                placeholder="e.g. 3"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                error={fieldErrors.target}
              />
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-brand px-4" disabled={busy}>
            {busy ? "Saving…" : isEdit ? "Save changes" : "Add metric"}
          </button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
