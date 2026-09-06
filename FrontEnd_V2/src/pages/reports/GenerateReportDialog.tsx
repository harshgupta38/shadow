import { useEffect, useRef, useState } from "react";
import { Modal } from "react-bootstrap";
import { CalendarDate, CheckCircleFill, Stars } from "react-bootstrap-icons";

import { api } from "@/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type ReportType = "daily" | "weekly";
type DialogState = "form" | "loading" | "success" | "error";

interface Props {
  show: boolean;
  onHide: () => void;
  todayStr: string; // YYYY-MM-DD — caller provides IST-aware today
}

// ─── Helpers (all IST-aware) ──────────────────────────────────────────────────

const IST = "Asia/Kolkata";
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

// Timestamp for a YYYY-MM-DD string, pinned to noon IST to avoid any DST edge.
function istNoon(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 6, 30)); // 06:30 UTC = 12:00 IST
}

// Format a YYYY-MM-DD string for display, interpreted in IST.
function fmtDisplay(dateStr: string): string {
  if (!dateStr) return "";
  return istNoon(dateStr).toLocaleDateString("en-GB", {
    day: "2-digit", month: "long", year: "numeric", timeZone: IST,
  });
}

// IST day-of-week index (0=Sun … 6=Sat) for a YYYY-MM-DD string.
function istDayOfWeek(dateStr: string): number {
  const abbr = new Intl.DateTimeFormat("en", { weekday: "short", timeZone: IST })
    .format(istNoon(dateStr));
  return DOW.indexOf(abbr as typeof DOW[number]);
}

// Add n days to a YYYY-MM-DD string and return a new YYYY-MM-DD string.
function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n, 6, 30));
  const parts = new Intl.DateTimeFormat("en-GB", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: IST,
  }).formatToParts(dt);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Returns the Saturday of the same week as `dateStr` (IST), capped at `todayStr`.
 * If the upcoming Saturday is in the future, returns the previous Saturday.
 */
function snapToSaturday(dateStr: string, todayStr: string): string {
  const daysUntilSat = (6 - istDayOfWeek(dateStr) + 7) % 7; // 0 if already Sat
  const sat = daysUntilSat === 0 ? dateStr : addDays(dateStr, daysUntilSat);
  return sat > todayStr ? addDays(sat, -7) : sat;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GenerateReportDialog({ show, onHide, todayStr }: Props) {
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [reportType, setReportType] = useState<ReportType>("daily");
  const [dateStr, setDateStr] = useState(todayStr);
  const [dialogState, setDialogState] = useState<DialogState>("form");
  const [errorMsg, setErrorMsg] = useState("");

  // Reset to defaults each time the dialog opens
  useEffect(() => {
    if (show) {
      setReportType("daily");
      setDateStr(todayStr);
      setDialogState("form");
      setErrorMsg("");
    }
  }, [show, todayStr]);

  function handleTypeChange(type: ReportType) {
    setReportType(type);
    if (type === "weekly") setDateStr(snapToSaturday(dateStr, todayStr));
    else setDateStr(prev => (prev > todayStr ? todayStr : prev));
  }

  function handleDateChange(val: string) {
    if (!val) return;
    setDateStr(reportType === "weekly" ? snapToSaturday(val, todayStr) : val);
  }

  async function handleSubmit() {
    setDialogState("loading");
    try {
      await api.reports.requestAiReport(dateStr, reportType);
      setDialogState("success");
    } catch {
      setErrorMsg("Something went wrong. Please try again.");
      setDialogState("error");
    }
  }

  return (
    <Modal show={show} onHide={onHide} centered backdrop="static">
      <Modal.Body className="p-4">

        {/* ── Success state ───────────────────────────────────────────── */}
        {dialogState === "success" && (
          <div className="text-center py-2">
            <div className="empty-icon mx-auto mb-3 text-success">
              <CheckCircleFill size={28} />
            </div>
            <h2 className="h5 fw-bold mb-2">{reportType === 'daily' ? 'Daily' : 'Weekly'} report is on its way ✨</h2>
            <p className="text-muted-2 mb-4">
              Your report for <strong>{fmtDisplay(dateStr)}</strong> is being prepared. We'll notify you when it's ready.
            </p>
            <button type="button" className="btn btn-soft px-4" onClick={onHide}>
              Close
            </button>
          </div>
        )}

        {/* ── Form + loading + error states ──────────────────────────── */}
        {dialogState !== "success" && (
          <>
            {/* Header */}
            <div className="note-dialog-header mb-4">
              <div className="empty-icon" aria-hidden="true">
                <Stars size={24} />
              </div>
              <div>
                <h2 className="h5 fw-bold mb-0">Generate Report</h2>
                <p className="text-muted-2 mb-0">Choose a report type and date.</p>
              </div>
            </div>

            {/* Type toggle */}
            <div className="mb-3">
              <p className="form-label fw-semibold text-muted-2 small mb-2">Report Type</p>
              <div className="goal-task-type-toggle goal-task-type-toggle--compact mt-0">
                <button
                  type="button"
                  className={`goal-task-type-option ${reportType === "daily" ? "is-active" : ""}`.trim()}
                  onClick={() => handleTypeChange("daily")}
                  disabled={dialogState === "loading"}
                >
                  <span className="goal-task-type-option-title">Daily</span>
                </button>
                <button
                  type="button"
                  className={`goal-task-type-option ${reportType === "weekly" ? "is-active" : ""}`.trim()}
                  onClick={() => handleTypeChange("weekly")}
                  disabled={dialogState === "loading"}
                >
                  <span className="goal-task-type-option-title">Weekly</span>
                </button>
              </div>
              {reportType === "weekly" && (
                <p className="text-muted-2 small mt-2 mb-0">
                  Weekly reports cover Sunday–Saturday. The date will snap to the nearest past Saturday.
                </p>
              )}
            </div>

            {/* Date input */}
            <div className="mb-4">
              <label className="form-label fw-semibold text-muted-2 small mb-2">
                Report Date
              </label>
              <div
                className="form-control d-flex align-items-center justify-content-between position-relative"
                style={{ cursor: dialogState === "loading" ? "not-allowed" : "pointer" }}
                onClick={() => dialogState !== "loading" && dateInputRef.current?.showPicker()}
              >
                <span>{fmtDisplay(dateStr)}</span>
                <CalendarDate size={15} className="text-muted-2 flex-shrink-0" />
                <input
                  ref={dateInputRef}
                  type="date"
                  value={dateStr}
                  max={todayStr}
                  onChange={e => handleDateChange(e.target.value)}
                  style={{ position: "absolute", bottom: 0, left: 0, width: 1, height: 1, opacity: 0, pointerEvents: "none", border: "none" }}
                />
              </div>
            </div>

            {/* Error message */}
            {dialogState === "error" && (
              <p className="text-danger small mb-3">{errorMsg}</p>
            )}

            {/* Actions */}
            <div className="d-flex gap-2 justify-content-end">
              <button
                type="button"
                className="btn btn-outline-secondary px-4"
                onClick={onHide}
                disabled={dialogState === "loading"}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-brand px-4"
                onClick={handleSubmit}
                disabled={!dateStr || dialogState === "loading"}
              >
                {dialogState === "loading" ? "Requesting…" : "Generate"}
              </button>
            </div>
          </>
        )}

      </Modal.Body>
    </Modal>
  );
}
