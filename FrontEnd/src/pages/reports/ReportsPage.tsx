import { useState } from "react";
import { Modal } from "react-bootstrap";
import {
  CalendarWeek,
  FileEarmarkBarGraphFill,
  LightningChargeFill,
} from "react-bootstrap-icons";

import { api, ApiError, type Report, type ReportPeriod } from "@/api";
import { ReportDetail } from "@/components/reports/ReportDetail";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { SectionCard } from "@/components/ui/SectionCard";
import { useToast } from "@/context/ToastContext";
import { useAsync } from "@/hooks/useAsync";
import { clampPercent, formatDate, relativeTime } from "@/lib/format";

type Filter = "all" | ReportPeriod;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
];

function ReportCard({ report, onOpen }: { report: Report; onOpen: () => void }) {
  const tasks = report.metrics_json?.tasks ?? { planned: 0, completed: 0 };
  const completion = tasks.planned > 0 ? clampPercent((tasks.completed / tasks.planned) * 100) : 0;
  const snippet = report.narrative?.split(/\n+/)[0] ?? "";

  return (
    <button type="button" className="surface p-4 text-start w-100 border-0 card-hover h-100" onClick={onOpen}>
      <div className="d-flex align-items-center justify-content-between mb-2">
        <Pill variant={report.period === "weekly" ? "info" : "brand"}>
          <CalendarWeek size={12} /> {report.period === "weekly" ? "Weekly" : "Daily"}
        </Pill>
        <span className="text-faint small">{relativeTime(report.created_at)}</span>
      </div>
      <div className="fw-bold mb-1">
        {formatDate(report.period_start)}
        {report.period === "weekly" && <> → {formatDate(report.period_end)}</>}
      </div>
      {snippet && <p className="text-muted-2 small line-clamp-2 mb-3">{snippet}</p>}
      <div className="d-flex align-items-center gap-2">
        <div className="progress flex-grow-1" style={{ height: 6 }}>
          <div className="progress-bar" style={{ width: `${completion}%` }} />
        </div>
        <span className="small fw-semibold text-muted-2">
          {tasks.completed}/{tasks.planned}
        </span>
      </div>
    </button>
  );
}

export function ReportsPage() {
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [genPeriod, setGenPeriod] = useState<ReportPeriod>("daily");
  const [generating, setGenerating] = useState(false);
  const [selected, setSelected] = useState<Report | null>(null);

  const { data, loading, error, reload, setData } = useAsync(
    () => api.reports.list(filter === "all" ? undefined : filter),
    [filter],
  );

  const reports = data ?? [];

  async function generate() {
    setGenerating(true);
    try {
      const report = await api.reports.generate({ period: genPeriod });
      toast.success(`${genPeriod === "weekly" ? "Weekly" : "Daily"} report ready.`);
      if (filter === "all" || filter === genPeriod) {
        setData((prev) => [report, ...(prev ?? [])]);
      } else {
        reload();
      }
      setSelected(report);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't generate the report.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="See your progress in numbers. A clear report today keeps you aligned tomorrow."
        icon={<FileEarmarkBarGraphFill size={20} />}
      />

      {/* Generate */}
      <SectionCard className="mb-4">
        <div className="d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-3">
          <div>
            <h2 className="h6 fw-bold mb-1">Generate a report</h2>
            <p className="text-muted-2 small mb-0">
              Jarvis rolls up your tasks and metrics, then writes a summary with next steps.
            </p>
          </div>
          <div className="d-flex align-items-center gap-2">
            <div className="nav-tabs-jv">
              {(["daily", "weekly"] as ReportPeriod[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`nav-tab-jv ${genPeriod === p ? "active" : ""}`}
                  onClick={() => setGenPeriod(p)}
                >
                  {p === "daily" ? "Daily" : "Weekly"}
                </button>
              ))}
            </div>
            <button className="btn btn-brand flex-shrink-0" onClick={generate} disabled={generating}>
              <LightningChargeFill size={15} className="me-1" />
              {generating ? "Generating…" : "Generate"}
            </button>
          </div>
        </div>
      </SectionCard>

      {/* Filter */}
      <div className="nav-tabs-jv mb-4">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={`nav-tab-jv ${filter === f.value ? "active" : ""}`}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && <LoadingState label="Loading reports…" />}

      {error && !loading && (
        <EmptyState
          icon={<FileEarmarkBarGraphFill size={26} />}
          title="Couldn't load reports"
          message={error}
          action={
            <button className="btn btn-brand" onClick={reload}>
              Retry
            </button>
          }
        />
      )}

      {!loading && !error && reports.length === 0 && (
        <div className="surface">
          <EmptyState
            icon={<FileEarmarkBarGraphFill size={26} />}
            title="No reports yet"
            message="Generate your first daily or weekly report to see your momentum summarised."
            action={
              <button className="btn btn-brand" onClick={generate} disabled={generating}>
                <LightningChargeFill size={15} className="me-1" /> Generate report
              </button>
            }
          />
        </div>
      )}

      {!loading && !error && reports.length > 0 && (
        <div className="row g-3">
          {reports.map((report) => (
            <div className="col-md-6 col-xl-4" key={report.id}>
              <ReportCard report={report} onOpen={() => setSelected(report)} />
            </div>
          ))}
        </div>
      )}

      <Modal show={!!selected} onHide={() => setSelected(null)} centered size="lg" scrollable>
        <Modal.Header closeButton>
          <Modal.Title className="h5 fw-bold">Progress report</Modal.Title>
        </Modal.Header>
        <Modal.Body>{selected && <ReportDetail report={selected} />}</Modal.Body>
      </Modal>
    </div>
  );
}
