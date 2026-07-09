import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  CalendarWeek,
  ClockHistory,
  FileEarmarkBarGraphFill,
  LightningChargeFill,
} from "react-bootstrap-icons";

import {
  api,
  ApiError,
  type ReportHistoryCard,
  type ReportPeriod,
} from "@/api";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { SectionCard } from "@/components/ui/SectionCard";
import { useToast } from "@/context/ToastContext";
import { useAsync } from "@/hooks/useAsync";
import { formatDateLong, relativeTime } from "@/lib/format";

type Filter = "all" | ReportPeriod;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
];

function parseFilter(value: string | null): Filter {
  if (value === "daily" || value === "weekly") return value;
  return "all";
}

function formatHistoryDate(value: string): string {
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return value;
  return formatDateLong(new Date(year, month - 1, day, 12));
}

function buildViewerPath(historyDate: string, reportId: number, period?: ReportPeriod): string {
  const params = new URLSearchParams();
  if (period) params.set("period", period);
  params.set("reportId", String(reportId));
  return `/reports/day/${historyDate}?${params.toString()}`;
}

function HistoryCard({ card, onOpen }: { card: ReportHistoryCard; onOpen: () => void }) {
  return (
    <button type="button" className="surface p-4 text-start w-100 border-0 card-hover h-100" onClick={onOpen}>
      <div className="d-flex align-items-center justify-content-between gap-2 mb-2 flex-wrap">
        <div className="d-flex align-items-center gap-2 flex-wrap">
          {card.report_periods.map((period) => (
            <Pill key={period} variant={period === "weekly" ? "info" : "brand"}>
              <CalendarWeek size={12} /> {period === "weekly" ? "Weekly" : "Daily"}
            </Pill>
          ))}
          <Pill variant="muted">{card.versions_count} version{card.versions_count === 1 ? "" : "s"}</Pill>
        </div>
        <span className="text-faint small">{relativeTime(card.latest_created_at)}</span>
      </div>

      <div className="fw-bold mb-1">{formatHistoryDate(card.history_date)}</div>
      <div className="small text-muted-2 mb-2">Latest generated {formatDateLong(card.latest_created_at)}</div>
      {card.latest_narrative_snippet && (
        <p className="text-muted-2 small line-clamp-2 mb-0">{card.latest_narrative_snippet}</p>
      )}
    </button>
  );
}

export function ReportsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const filter = parseFilter(searchParams.get("period"));
  const [genPeriod, setGenPeriod] = useState<ReportPeriod>("daily");
  const [generating, setGenerating] = useState(false);

  const { data, loading, error, reload, setData } = useAsync(
    () => api.reports.history(filter === "all" ? undefined : filter),
    [filter],
  );

  const historyCards = data ?? [];

  function setFilter(nextFilter: Filter) {
    const next = new URLSearchParams(searchParams);
    if (nextFilter === "all") next.delete("period");
    else next.set("period", nextFilter);
    setSearchParams(next, { replace: true });
  }

  async function generate() {
    setGenerating(true);
    try {
      const report = await api.reports.generate({ period: genPeriod });
      const refreshed = await api.reports.history();
      setData(refreshed);
      toast.success(`${genPeriod === "weekly" ? "Weekly" : "Daily"} report ready.`);

      const target = refreshed.find((card) => card.latest_report_id === report.id);
      if (target) {
        navigate(buildViewerPath(target.history_date, report.id));
      }
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
        subtitle="Shadow keeps your reflections organized by day so you can revisit every version."
        icon={<FileEarmarkBarGraphFill size={20} />}
      />

      <SectionCard className="mb-4">
        <div className="d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-3">
          <div>
            <h2 className="h6 fw-bold mb-1">Generate a report</h2>
            <p className="text-muted-2 small mb-0">
              Create a fresh reflection now. Automatic reports are generated in the background at night.
            </p>
          </div>
          <div className="d-flex align-items-center gap-2">
            <div className="nav-tabs-jv">
              {(["daily", "weekly"] as ReportPeriod[]).map((period) => (
                <button
                  key={period}
                  type="button"
                  className={`nav-tab-jv ${genPeriod === period ? "active" : ""}`}
                  onClick={() => setGenPeriod(period)}
                >
                  {period === "daily" ? "Daily" : "Weekly"}
                </button>
              ))}
            </div>
            <button className="btn btn-brand flex-shrink-0" onClick={generate} disabled={generating}>
              <LightningChargeFill size={15} className="me-1" />
              {generating ? "Generating..." : "Generate"}
            </button>
          </div>
        </div>
      </SectionCard>

      <div className="nav-tabs-jv mb-4">
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            className={`nav-tab-jv ${filter === item.value ? "active" : ""}`}
            onClick={() => setFilter(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading && <LoadingState label="Loading report history..." />}

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

      {!loading && !error && historyCards.length === 0 && (
        <div className="surface">
          <EmptyState
            icon={<ClockHistory size={26} />}
            title="No report history yet"
            message="Generate your first daily or weekly report to start building your reflection timeline."
            action={
              <button className="btn btn-brand" onClick={generate} disabled={generating}>
                <LightningChargeFill size={15} className="me-1" /> Generate report
              </button>
            }
          />
        </div>
      )}

      {!loading && !error && historyCards.length > 0 && (
        <div className="row g-3">
          {historyCards.map((card) => (
            <div className="col-md-6 col-xl-4" key={card.history_date}>
              <HistoryCard
                card={card}
                onOpen={() =>
                  navigate(
                    buildViewerPath(
                      card.history_date,
                      card.latest_report_id,
                      filter === "all" ? undefined : filter,
                    ),
                  )
                }
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
