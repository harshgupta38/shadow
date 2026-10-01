import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, CpuFill } from "react-bootstrap-icons";

import { api, type DailyUsageEntry, type UsageResponse } from "@/api";
import "@/pages/profile/UsagePanel/UsagePanel.scss";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en", { month: "short", day: "numeric" });
}

function currentYM() {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export function UsagePanel() {
  const init = currentYM();
  const [year,    setYear   ] = useState(init.year);
  const [month,   setMonth  ] = useState(init.month);
  const [usage,   setUsage  ] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState<DailyUsageEntry | null>(null);

  const { year: curYear, month: curMonth } = currentYM();
  const isCurrentMonth = year === curYear && month === curMonth;

  function shiftMonth(delta: -1 | 1) {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
    setHovered(null);
  }

  useEffect(() => {
    setLoading(true);
    setUsage(null);
    setHovered(null);
    api.profile.getUsage(year, month)
      .then(setUsage)
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [year, month]);

  const entries: DailyUsageEntry[] = usage?.daily ?? [];
  const totalSum = entries.reduce((s, e) => s + e.input_tokens + e.output_tokens, 0);
  const hasData  = totalSum > 0;
  const maxTotal = Math.max(...entries.map(e => e.input_tokens + e.output_tokens), 1);

  return (
    <div className="surface panel-card">
      {/* Header */}
      <div className="usage-panel-header">
        <div className="usage-panel-header-left">
          <span className="stat-icon panel-header-icon panel-header-icon--info">
            <CpuFill size={18} />
          </span>
          <div>
            <h3 className="panel-header-title">AI Usage</h3>
            <p className="panel-header-desc">Token usage across all AI features.</p>
          </div>
        </div>

        <div className="usage-month-nav">
          <button type="button" className="usage-nav-btn" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
            <ChevronLeft size={13} />
          </button>
          <span className="usage-month-label">{MONTH_NAMES[month - 1]} {year}</span>
          <button type="button" className="usage-nav-btn" aria-label="Next month" disabled={isCurrentMonth} onClick={() => shiftMonth(1)}>
            <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {/* Chart */}
      {loading ? (
        <div className="usage-placeholder">
          <span className="spinner-border spinner-border-sm text-secondary" />
        </div>
      ) : !hasData ? (
        <div className="usage-placeholder">
          <span className="usage-placeholder-text">No usage recorded for this month.</span>
        </div>
      ) : (
        <div
          className="usage-bars"
          onMouseLeave={() => setHovered(null)}
          onMouseMove={(e) => {
            const col = (e.target as Element).closest<HTMLElement>("[data-date]");
            if (!col) return;
            const dt = col.dataset.date!;
            if (hovered?.date !== dt) {
              setHovered(entries.find(en => en.date === dt) ?? null);
            }
          }}
        >
          {entries.map((entry) => {
            const total = entry.input_tokens + entry.output_tokens;
            const pct   = (total / maxTotal) * 100;
            const day   = Number(entry.date.split("-")[2]);
            return (
              <div
                key={entry.date}
                data-date={entry.date}
                className={`usage-col${hovered?.date === entry.date ? " usage-col--active" : ""}`}
              >
                <div className="usage-track">
                  <div
                    className="usage-bar"
                    style={{ height: total > 0 ? `${Math.max(pct, 2)}%` : "2px" }}
                  />
                </div>
                <span className="usage-date">{day}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer — hover detail */}
      {hasData && !loading && (
        <div className="usage-footer">
          {hovered ? (
            <>
              <span className="usage-footer-date">{formatDate(hovered.date)}</span>
              <span className="usage-footer-sep" />
              <span className="usage-footer-stat">
                Input <strong>{fmtTokens(hovered.input_tokens)}</strong>
              </span>
              <span className="usage-footer-sep" />
              <span className="usage-footer-stat">
                Output <strong>{fmtTokens(hovered.output_tokens)}</strong>
              </span>
              <span className="usage-footer-sep" />
              <span className="usage-footer-stat">
                Total <strong>{fmtTokens(hovered.input_tokens + hovered.output_tokens)}</strong>
              </span>
            </>
          ) : (
            <span className="usage-footer-hint">Hover a bar to see details</span>
          )}
        </div>
      )}
    </div>
  );
}
