import { useState } from "react";
import { GraphUpArrow, PlusLg } from "react-bootstrap-icons";

import { api, ApiError, type TrackedMetric } from "@/api";
import { MetricCard } from "@/components/metrics/MetricCard";
import { MetricFormModal } from "@/components/metrics/MetricFormModal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/context/ToastContext";
import { useAsync } from "@/hooks/useAsync";

export function TrackPage() {
  const toast = useToast();
  const { data, loading, error, reload, setData } = useAsync(() => api.metrics.list(), []);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<TrackedMetric | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TrackedMetric | null>(null);
  const [deleting, setDeleting] = useState(false);

  const metrics = data ?? [];

  function openNew() {
    setEditing(null);
    setShowModal(true);
  }

  function openEdit(metric: TrackedMetric) {
    setEditing(metric);
    setShowModal(true);
  }

  function handleSaved(metric: TrackedMetric, isNew: boolean) {
    setData((prev) => {
      const list = prev ?? [];
      return isNew ? [...list, metric] : list.map((m) => (m.id === metric.id ? metric : m));
    });
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

      <MetricFormModal
        show={showModal}
        metric={editing}
        onClose={() => setShowModal(false)}
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
