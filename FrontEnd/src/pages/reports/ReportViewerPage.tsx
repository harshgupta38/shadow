import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarWeek,
  ChevronLeft,
  ChevronRight,
  FileEarmarkBarGraphFill,
  Trash3,
} from "react-bootstrap-icons";

import { api, ApiError, type Report, type ReportPeriod } from "@/api";
import { ReportDetail } from "@/components/reports/ReportDetail";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { SectionCard } from "@/components/ui/SectionCard";
import { useToast } from "@/context/ToastContext";
import { useAsync } from "@/hooks/useAsync";
import { formatDate } from "@/lib/format";

function parseReportPeriod(value: string | null): ReportPeriod | undefined {
  if (value === "daily" || value === "weekly") return value;
  return undefined;
}

function formatTimeOnly(input?: string | Date | null): string {
  if (!input) return "";
  const date = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function reportTitle(report: Report | null): string {
  if (!report) return "Report";
  return report.period === "weekly" ? "Weekly Report" : "Daily Report";
}

function reportSourceLabel(source: Report["source"]): string {
  return source === "automatic" ? "Automatically generated" : "Manually generated";
}

function reportsListPath(period?: ReportPeriod): string {
  if (!period) return "/reports";
  return `/reports?period=${period}`;
}

export function ReportViewerPage() {
  const { historyDate } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const period = parseReportPeriod(searchParams.get("period"));
  const reportIdParam = Number(searchParams.get("reportId") ?? NaN);

  const { data, loading, error, reload, setData } = useAsync(
    () => {
      if (!historyDate) return Promise.resolve([] as Report[]);
      return api.reports.versions(historyDate, period);
    },
    [historyDate, period],
  );

  const versions = data ?? [];
  const current = versions[selectedIndex] ?? null;

  useEffect(() => {
    if (versions.length === 0) {
      setSelectedIndex(0);
      return;
    }

    const requestedIndex = Number.isFinite(reportIdParam)
      ? versions.findIndex((report) => report.id === reportIdParam)
      : -1;

    if (requestedIndex >= 0) {
      setSelectedIndex(requestedIndex);
      return;
    }

    setSelectedIndex(versions.length - 1);
  }, [versions, reportIdParam]);

  const canGoPrevious = selectedIndex > 0;
  const canGoNext = selectedIndex < versions.length - 1;

  const metaDate = useMemo(() => {
    if (!current) return "";
    return `${formatDate(current.created_at)} • ${formatTimeOnly(current.created_at)}`;
  }, [current]);

  function gotoIndex(nextIndex: number) {
    if (versions.length === 0) return;
    const bounded = Math.max(0, Math.min(nextIndex, versions.length - 1));
    const report = versions[bounded];
    setSelectedIndex(bounded);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("reportId", String(report.id));
    setSearchParams(nextParams, { replace: true });
  }

  async function deleteCurrentReport() {
    if (!current) return;

    setDeleting(true);
    try {
      await api.reports.remove(current.id);
      const remaining = versions.filter((report) => report.id !== current.id);
      toast.success("Report deleted.");

      if (remaining.length === 0) {
        navigate(reportsListPath(period), { replace: true });
        return;
      }

      setData(remaining);
      const nextIndex = Math.min(selectedIndex, remaining.length - 1);
      setSelectedIndex(nextIndex);

      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("reportId", String(remaining[nextIndex].id));
      setSearchParams(nextParams, { replace: true });
      setConfirmDelete(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't delete this report version.");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return <LoadingState label="Loading report versions..." />;

  if (error) {
    return (
      <EmptyState
        icon={<FileEarmarkBarGraphFill size={26} />}
        title="Couldn't load this report"
        message={error}
        action={
          <button className="btn btn-brand" onClick={reload}>
            Retry
          </button>
        }
      />
    );
  }

  if (!historyDate || versions.length === 0 || !current) {
    return (
      <EmptyState
        icon={<FileEarmarkBarGraphFill size={26} />}
        title="No reports found for this date"
        message="This day no longer has saved report versions."
        action={
          <Link className="btn btn-brand" to={reportsListPath(period)}>
            Back to reports
          </Link>
        }
      />
    );
  }

  return (
    <div>
      <PageHeader
        title={reportTitle(current)}
        subtitle={metaDate}
        icon={<FileEarmarkBarGraphFill size={20} />}
        actions={
          <Link to={reportsListPath(period)} className="btn btn-outline-secondary">
            <ArrowLeft size={14} className="me-1" /> Back
          </Link>
        }
      />

      <SectionCard className="mb-4">
        <div className="d-flex flex-column flex-lg-row gap-3 justify-content-between">
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <Pill variant={current.period === "weekly" ? "info" : "brand"}>
              <CalendarWeek size={12} /> {current.period === "weekly" ? "Weekly" : "Daily"}
            </Pill>
            <Pill variant={current.source === "automatic" ? "info" : "muted"}>
              {reportSourceLabel(current.source)}
            </Pill>
            <span className="text-muted-2 small">Version {selectedIndex + 1} of {versions.length}</span>
          </div>

          <div className="d-flex align-items-center gap-2 flex-wrap">
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={() => gotoIndex(selectedIndex - 1)}
              disabled={!canGoPrevious}
            >
              <ChevronLeft size={14} className="me-1" /> Previous
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={() => gotoIndex(selectedIndex + 1)}
              disabled={!canGoNext}
            >
              Next <ChevronRight size={14} className="ms-1" />
            </button>
            <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
              <Trash3 size={14} className="me-1" /> Delete
            </button>
          </div>
        </div>
      </SectionCard>

      <SectionCard>
        <ReportDetail report={current} />
      </SectionCard>

      <ConfirmDialog
        show={confirmDelete}
        title="Delete this report version?"
        message="Only this selected version will be deleted. Other versions from this date stay available."
        confirmLabel="Delete"
        destructive
        busy={deleting}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={deleteCurrentReport}
      />
    </div>
  );
}
