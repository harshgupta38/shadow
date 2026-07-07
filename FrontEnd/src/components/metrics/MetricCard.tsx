import { useMemo, useState } from "react";
import { Dropdown } from "react-bootstrap";
import { Fire, PencilSquare, PlusLg, ThreeDotsVertical, Trash3 } from "react-bootstrap-icons";

import { api, ApiError, type TrackedMetric } from "@/api";
import { Pill } from "@/components/ui/Pill";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { Sparkbar } from "@/components/ui/Sparkbar";
import { useToast } from "@/context/ToastContext";
import { useAsync } from "@/hooks/useAsync";
import { clampPercent, formatMetricValue } from "@/lib/format";
import { METRIC_TIME_SPAN_LABEL, METRIC_UNIT_LABEL } from "@/lib/labels";
import { computeMetricStats } from "@/lib/metrics";

interface MetricCardProps {
  metric: TrackedMetric;
  onEdit: (metric: TrackedMetric) => void;
  onDelete: (metric: TrackedMetric) => void;
}

export function MetricCard({ metric, onEdit, onDelete }: MetricCardProps) {
  const toast = useToast();
  const { data: logs, loading, reload } = useAsync(() => api.metrics.logs(metric.id), [metric.id]);
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [logging, setLogging] = useState(false);
  const isHabitLinkedMetric = (metric.linked_habit_ids?.length ?? 0) > 0;

  const timeSpan = metric.time_span ?? "day";
  const isDailyStreakMetric =
    timeSpan === "day" && metric.target === 1 && (metric.unit === "count" || metric.unit === "custom");
  const isWeeklyStreakMetric =
    timeSpan === "week"
    && (metric.target ?? 0) > 0
    && (metric.unit === "count" || metric.unit === "custom");
  const isStreakMetric = isDailyStreakMetric || isWeeklyStreakMetric;
  const stats = useMemo(
    () => computeMetricStats(logs ?? [], {
      streakMode: isWeeklyStreakMetric ? "weekly" : "daily",
      weeklyTarget: isWeeklyStreakMetric ? metric.target : null,
    }),
    [logs, isWeeklyStreakMetric, metric.target],
  );
  const unitLabel = (metric.unit_text ?? "").trim() || METRIC_UNIT_LABEL[metric.unit];
  const streakUnitLabel = isWeeklyStreakMetric ? "week" : "day";
  const timeSpanLabel =
    timeSpan === "custom"
      ? (metric.time_span_custom_text ?? "").trim() || "Custom"
      : METRIC_TIME_SPAN_LABEL[timeSpan];
  const primaryValue = timeSpan === "week" ? stats.weekTotal : stats.todayTotal;
  const primaryLabel = timeSpan === "week" ? "this week" : "today";
  const targetBaseValue = timeSpan === "day" ? stats.todayTotal : timeSpan === "week" ? stats.weekTotal : null;
  const targetPct =
    metric.target != null && targetBaseValue != null
      ? clampPercent((targetBaseValue / metric.target) * 100)
      : null;

  async function log(amount: number, withNote?: string) {
    if (amount <= 0 || Number.isNaN(amount)) return;
    setLogging(true);
    try {
      await api.metrics.addLog(metric.id, { value: amount, note: withNote?.trim() || null });
      setValue("");
      setNote("");
      setShowNote(false);
      reload();
      toast.success(`Logged ${formatMetricValue(amount, metric.unit, metric.unit_text)} · ${metric.label}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't log activity.");
    } finally {
      setLogging(false);
    }
  }

  return (
    <div className="surface p-4 h-100 d-flex flex-column">
      <div className="d-flex align-items-start justify-content-between gap-2 mb-3">
        <div className="min-w-0">
          <h3 className="h6 fw-bold mb-1 text-truncate">{metric.label}</h3>
          <div className="d-flex align-items-center gap-2">
            <Pill>{unitLabel}</Pill>
            {(isStreakMetric || stats.streak > 0) && (
              <Pill variant={stats.streak > 0 ? "warn" : "muted"}>
                <Fire size={12} /> {stats.streak} {streakUnitLabel}{stats.streak > 1 ? "s" : ""} streak
              </Pill>
            )}
          </div>
        </div>
        <Dropdown align="end">
          <Dropdown.Toggle
            as="button"
            className="btn btn-ghost btn-icon border-0"
            style={{ width: 34, height: 34 }}
          >
            <ThreeDotsVertical size={16} />
          </Dropdown.Toggle>
          <Dropdown.Menu>
            <Dropdown.Item onClick={() => onEdit(metric)}>
              <PencilSquare size={14} className="me-2" /> Edit
            </Dropdown.Item>
            <Dropdown.Item className="text-danger" onClick={() => onDelete(metric)}>
              <Trash3 size={14} className="me-2" /> Delete
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
      </div>

      <div className="d-flex align-items-center gap-3 mb-3">
        <div className="flex-grow-1">
          <div className="stat-value">{formatMetricValue(primaryValue, metric.unit, metric.unit_text)}</div>
          <div className="stat-label">
            {primaryLabel}
            {metric.target != null && (
              <>
                {" "}· target {formatMetricValue(metric.target, metric.unit, metric.unit_text)} / {timeSpanLabel}
              </>
            )}
          </div>
        </div>
        {targetPct !== null ? (
          <ProgressRing value={targetPct} size={62} stroke={7} />
        ) : (
          <div className="text-end">
            <div className="fw-bold">{formatMetricValue(stats.weekTotal, metric.unit, metric.unit_text)}</div>
            <div className="text-faint small">this week</div>
          </div>
        )}
      </div>

      <div className="mb-3">
        <Sparkbar values={loading ? [0, 0, 0, 0, 0, 0, 0] : stats.spark} />
        <div className="d-flex justify-content-between text-faint mt-1" style={{ fontSize: "0.68rem" }}>
          <span>7 days ago</span>
          <span>Today</span>
        </div>
      </div>

      {/* Quick log */}
      <div className="mt-auto">
        {isHabitLinkedMetric ? (
          <div className="text-faint small">
            This metric is linked to your habit flow and updates automatically.
          </div>
        ) : (
          <>
            <div className="d-flex gap-2">
              <input
                className="form-control"
                type="number"
                min={0}
                step="any"
                placeholder={`Add ${metric.unit === "minutes" ? "minutes" : unitLabel.toLowerCase() || "value"}…`}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void log(Number(value), note);
                  }
                }}
              />
              {(metric.unit === "count" || metric.unit === "custom") && (
                <button
                  type="button"
                  className="btn btn-outline-secondary flex-shrink-0"
                  title="Add one"
                  onClick={() => log(1)}
                  disabled={logging}
                >
                  <PlusLg size={16} /> 1
                </button>
              )}
              <button
                type="button"
                className="btn btn-brand flex-shrink-0"
                onClick={() => log(Number(value), note)}
                disabled={logging || value.trim() === ""}
              >
                Log
              </button>
            </div>
            {showNote ? (
              <input
                className="form-control mt-2"
                placeholder="Optional note…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            ) : (
              <button
                type="button"
                className="btn btn-ghost btn-sm mt-1 px-1 text-faint"
                onClick={() => setShowNote(true)}
              >
                + Add a note
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
