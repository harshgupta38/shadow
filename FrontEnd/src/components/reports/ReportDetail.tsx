import { CalendarWeek, LightningChargeFill, Stars } from "react-bootstrap-icons";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { Report } from "@/api";
import { Pill } from "@/components/ui/Pill";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { clampPercent, formatDate, formatMetricValue } from "@/lib/format";

function compactMarkdown(source: string): string {
  return source
    .replace(/\r\n?/g, "\n")
    .replace(/(^|\n)(\d+\.)\s*\n+(?=\S)/g, "$1$2 ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function ReportDetail({ report }: { report: Report }) {
  const data = report.metrics_json ?? { tasks: { planned: 0, completed: 0 }, metrics: [] };
  const tasks = data.tasks ?? { planned: 0, completed: 0 };
  const metrics = data.metrics ?? [];
  const completion = tasks.planned > 0 ? clampPercent((tasks.completed / tasks.planned) * 100) : 0;
  const narrative = compactMarkdown(report.narrative ?? "");
  const nextSteps = compactMarkdown(report.next_steps ?? "");

  return (
    <div>
      <div className="d-flex align-items-center gap-2 mb-4 flex-wrap">
        <Pill variant="brand">
          <CalendarWeek size={12} /> {report.period === "weekly" ? "Weekly" : "Daily"}
        </Pill>
        <span className="text-muted-2 small">
          {formatDate(report.period_start)}
          {report.period === "weekly" && <> → {formatDate(report.period_end)}</>}
        </span>
      </div>

      {/* Summary */}
      <div className="row g-3 mb-4">
        <div className="col-sm-5">
          <div className="surface-2 p-3 h-100 d-flex align-items-center gap-3">
            <ProgressRing value={completion} size={72} stroke={8} />
            <div>
              <div className="fw-bold h5 mb-0">
                {tasks.completed}/{tasks.planned}
              </div>
              <div className="text-muted-2 small">tasks completed</div>
            </div>
          </div>
        </div>
        <div className="col-sm-7">
          <div className="surface-2 p-3 h-100">
            <div className="text-muted-2 small fw-semibold mb-2">Metrics this period</div>
            {metrics.length === 0 ? (
              <div className="text-faint small">No metrics tracked in this period.</div>
            ) : (
              <div className="d-flex flex-column gap-2">
                {metrics.map((row) => {
                  const pct = row.target ? clampPercent((row.total / row.target) * 100) : null;
                  return (
                    <div key={row.key}>
                      <div className="d-flex justify-content-between small">
                        <span className="fw-medium text-truncate">{row.label}</span>
                        <span className="text-muted-2">
                          {formatMetricValue(row.total, row.unit)}
                          {row.target != null && (
                            <span className="text-faint">
                              {" "}
                              / {formatMetricValue(row.target, row.unit)}
                            </span>
                          )}
                        </span>
                      </div>
                      {pct !== null && (
                        <div className="progress mt-1" style={{ height: 5 }}>
                          <div className="progress-bar" style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Narrative */}
      {narrative && (
        <div className="mb-4">
          <div className="d-flex align-items-center gap-2 mb-2 fw-semibold">
            <Stars size={16} style={{ color: "var(--jv-brand-1)" }} /> Summary
          </div>
          <div className="report-markdown">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ node: _node, ...props }) => (
                  <a {...props} target="_blank" rel="noreferrer noopener" />
                ),
              }}
            >
              {narrative}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {/* Next steps */}
      {nextSteps && (
        <div className="surface-2 p-3 p-md-4">
          <div className="d-flex align-items-center gap-2 mb-3 fw-semibold">
            <LightningChargeFill size={16} style={{ color: "var(--jv-warn)" }} /> Next steps
          </div>
          <div className="report-markdown">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ node: _node, ...props }) => (
                  <a {...props} target="_blank" rel="noreferrer noopener" />
                ),
              }}
            >
              {nextSteps}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
