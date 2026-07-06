import { useState } from "react";
import { Clock, GraphUpArrow, PlusLg, Stars } from "react-bootstrap-icons";

import { api, ApiError, type MetricUnit, type ProgressCoachRecommendation, type TrackedMetric } from "@/api";
import { MetricCard } from "@/components/metrics/MetricCard";
import { MetricFormModal, type MetricFormInitialValues } from "@/components/metrics/MetricFormModal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { SectionCard } from "@/components/ui/SectionCard";
import { useToast } from "@/context/ToastContext";
import { useAsync } from "@/hooks/useAsync";
import { formatMetricValue } from "@/lib/format";
import { METRIC_UNIT_LABEL } from "@/lib/labels";

export function TrackPage() {
  const toast = useToast();
  const { data, loading, error, reload, setData } = useAsync(() => api.metrics.list(), []);
  const {
    data: recommendationData,
    loading: recommendationsLoading,
    error: recommendationsError,
    reload: reloadRecommendations,
    setData: setRecommendationData,
  } = useAsync(() => api.metrics.progressCoachRecommendations(), []);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<TrackedMetric | null>(null);
  const [createInitialValues, setCreateInitialValues] = useState<MetricFormInitialValues | null>(null);
  const [pendingRecommendationId, setPendingRecommendationId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TrackedMetric | null>(null);
  const [deleting, setDeleting] = useState(false);

  const metrics = data ?? [];
  const recommendations = recommendationData ?? [];

  function openNew() {
    setEditing(null);
    setCreateInitialValues(null);
    setPendingRecommendationId(null);
    setShowModal(true);
  }

  function openEdit(metric: TrackedMetric) {
    setEditing(metric);
    setCreateInitialValues(null);
    setPendingRecommendationId(null);
    setShowModal(true);
  }

  function handleSaved(metric: TrackedMetric, isNew: boolean) {
    setData((prev) => {
      const list = prev ?? [];
      return isNew ? [...list, metric] : list.map((m) => (m.id === metric.id ? metric : m));
    });

    if (isNew && pendingRecommendationId !== null) {
      setRecommendationData((prev) =>
        (prev ?? []).filter((item) => item.id !== pendingRecommendationId),
      );
    }

    setPendingRecommendationId(null);
    setCreateInitialValues(null);
  }

  function closeMetricModal() {
    setShowModal(false);
    setEditing(null);
    setCreateInitialValues(null);
    setPendingRecommendationId(null);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.metrics.remove(deleteTarget.id);
      setData((prev) => (prev ?? []).filter((m) => m.id !== deleteTarget.id));
      toast.success("Metric removed.");
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't remove the metric.");
    } finally {
      setDeleting(false);
    }
  }

  function recommendationUnitLabel(unit: TrackedMetric["unit"], unitHint?: string | null): string {
    if (unit === "custom" && unitHint && unitHint.trim()) {
      return `${METRIC_UNIT_LABEL.custom} (${unitHint.trim()})`;
    }
    return METRIC_UNIT_LABEL[unit];
  }

  function recommendationTargetLabel(
    target: number,
    unit: TrackedMetric["unit"],
    timeSpan: ProgressCoachRecommendation["time_span"],
    unitHint?: string | null,
  ): string {
    const suffixMap: Record<ProgressCoachRecommendation["time_span"], string> = {
      day: "d",
      week: "w",
      month: "m",
      year: "y",
      custom: "d",
    };
    const suffix = suffixMap[timeSpan] ?? "d";

    if (unit === "custom" && unitHint && unitHint.trim()) {
      return `${target}${unitHint.trim()}/${suffix}`;
    }
    return `${formatMetricValue(target, unit)}/${suffix}`;
  }

  function recommendationUnitText(recommendation: ProgressCoachRecommendation): string {
    if (recommendation.unit === "custom") {
      return recommendation.unit_hint?.trim() || "custom";
    }
    const unitMap: Record<MetricUnit, string> = {
      count: "count",
      minutes: "minutes",
      hours: "hours",
      custom: "custom",
    };
    return unitMap[recommendation.unit];
  }

  function openRecommendationDraft(recommendation: ProgressCoachRecommendation) {
    setEditing(null);
    setPendingRecommendationId(recommendation.id);
    setCreateInitialValues({
      label: recommendation.metric_name,
      key: recommendation.metric_key,
      unitText: recommendationUnitText(recommendation),
      timeSpan: recommendation.time_span,
      timeSpanCustomText: null,
      target: recommendation.target,
      linkedHabitIds: [recommendation.habit_id],
    });
    setShowModal(true);
  }

  return (
    <div>
      <PageHeader
        title="Track"
        subtitle="Log what moves you forward. Seeing the numbers keeps you aligned."
        icon={<GraphUpArrow size={20} />}
        actions={
          <button className="btn btn-brand" onClick={openNew}>
            <PlusLg size={16} className="me-1" /> New metric
          </button>
        }
      />

      {loading && <LoadingState label="Loading your metrics…" />}

      {error && !loading && (
        <EmptyState
          icon={<GraphUpArrow size={26} />}
          title="Couldn't load metrics"
          message={error}
          action={
            <button className="btn btn-brand" onClick={reload}>
              Retry
            </button>
          }
        />
      )}

      {!loading && !error && metrics.length === 0 && (
        <div className="surface">
          <EmptyState
            icon={<GraphUpArrow size={26} />}
            title="Start tracking"
            message="Add metrics like deep-work minutes, problems solved, or workouts. Quick daily logging builds the streaks and reports that keep you going."
            action={
              <button className="btn btn-brand" onClick={openNew}>
                <PlusLg size={16} className="me-1" /> Add your first metric
              </button>
            }
          />
        </div>
      )}

      {!loading && !error && metrics.length > 0 && (
        <div className="row g-3">
          {metrics.map((metric) => (
            <div className="col-md-6 col-xl-4" key={metric.id}>
              <MetricCard metric={metric} onEdit={openEdit} onDelete={setDeleteTarget} />
            </div>
          ))}
        </div>
      )}

      <div className="mt-4">
        <h2 className="h6 fw-bold mb-1">Progress Coach recommendations</h2>
        <p className="text-muted-2 small mb-2">
          Metric suggestions generated from your latest habit create/update changes.
        </p>
      </div>

      <SectionCard className="mb-4">
        {recommendationsLoading ? (
          <LoadingState full={false} label="Loading Progress Coach recommendations..." />
        ) : recommendationsError ? (
          <EmptyState
            compact
            icon={<Stars size={20} />}
            title="Couldn't load recommendations"
            message={recommendationsError}
            action={
              <button className="btn btn-brand btn-sm" onClick={reloadRecommendations}>
                Retry
              </button>
            }
          />
        ) : recommendations.length === 0 ? (
          <EmptyState
            compact
            icon={<Stars size={20} />}
            title="No pending recommendations"
            message="Create or update habits in the Habit Library to get measurable metric suggestions here."
          />
        ) : (
          <div className="row g-3">
            {recommendations.map((recommendation) => {
              return (
                <div key={recommendation.id} className="col-12 col-lg-6 col-xxl-4">
                  <article className="surface-2 p-3 h-100 d-flex flex-column">
                    <div className="d-flex align-items-start justify-content-between gap-2 mb-2">
                      <div className="min-w-0">
                        <div className="fw-semibold text-truncate">{recommendation.metric_name}</div>
                        <div className="small text-muted-2">{recommendation.rationale}</div>
                      </div>
                      <Stars size={16} className="text-faint flex-shrink-0" />
                    </div>

                    <div className="d-flex flex-wrap gap-2 mb-2">
                      <Pill>{recommendationUnitLabel(recommendation.unit, recommendation.unit_hint)}</Pill>
                      <Pill variant="info">
                        Target: {recommendationTargetLabel(
                          recommendation.target,
                          recommendation.unit,
                          recommendation.time_span,
                          recommendation.unit_hint,
                        )}
                      </Pill>
                    </div>

                    <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap mt-auto">
                      <div className="small text-muted-2 d-flex align-items-center gap-2 min-w-0">
                        <Clock size={12} className="text-faint flex-shrink-0" aria-hidden="true" />
                        <span className="fw-medium text-truncate">{recommendation.habit_name}</span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm"
                        onClick={() => {
                          openRecommendationDraft(recommendation);
                        }}
                      >
                        Add this
                      </button>
                    </div>
                  </article>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <MetricFormModal
        show={showModal}
        metric={editing}
        initialValues={createInitialValues}
        onClose={closeMetricModal}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        show={!!deleteTarget}
        title="Remove this metric?"
        message={
          deleteTarget
            ? `"${deleteTarget.label}" and its logged history will be removed.`
            : undefined
        }
        confirmLabel="Remove metric"
        destructive
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
