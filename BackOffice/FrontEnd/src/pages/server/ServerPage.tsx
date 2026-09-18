import { Fragment, useEffect, useRef, useState } from "react";
import { Modal } from "react-bootstrap";
import {
  CpuFill,
  ArrowClockwise,
  ArrowRepeat,
  Terminal,
  XLg,
  PhoneFill,
  ShieldFillCheck,
} from "react-bootstrap-icons";
import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import { StatCard } from "@/components/ui/StatCard/StatCard";
import { LiveLogTail } from "./LiveLogTail";

interface Worker {
  id: number;
  pid: number;
  cpu: number;
  memoryMb: number;
  requests: number;
  uptime: string;
}

const INITIAL_WORKERS: Worker[] = [
  { id: 1, pid: 18422, cpu: 12, memoryMb: 210, requests: 342, uptime: "6d 14h" },
  { id: 2, pid: 18423, cpu: 9, memoryMb: 198, requests: 318, uptime: "6d 14h" },
  { id: 3, pid: 18424, cpu: 15, memoryMb: 225, requests: 355, uptime: "6d 14h" },
  { id: 4, pid: 18425, cpu: 11, memoryMb: 205, requests: 269, uptime: "6d 14h" },
];

interface RestartEvent {
  id: number;
  timestamp: string;
  trigger: string;
  initiatedBy: string;
  duration: string;
  result: "success" | "failed";
}

const INITIAL_HISTORY: RestartEvent[] = [
  { id: 1, timestamp: "18 Sep 2026, 06:12 AM", trigger: "Webhook", initiatedBy: "GitHub Actions · deploy v2.4.1", duration: "8s", result: "success" },
  { id: 2, timestamp: "15 Sep 2026, 09:40 AM", trigger: "Webhook", initiatedBy: "GitHub Actions · deploy v2.4.0", duration: "7s", result: "success" },
  { id: 3, timestamp: "12 Sep 2026, 02:15 AM", trigger: "Auto-recovery", initiatedBy: "Watchdog · high memory usage", duration: "11s", result: "success" },
  { id: 4, timestamp: "10 Sep 2026, 02:20 PM", trigger: "Manual", initiatedBy: "Harsh Gupta · BackOffice", duration: "6s", result: "success" },
  { id: 5, timestamp: "04 Sep 2026, 08:05 AM", trigger: "Webhook", initiatedBy: "GitHub Actions · deploy v2.3.8", duration: "9s", result: "failed" },
];

interface ActiveJob {
  scope: "all" | number;
  label: string;
}

function buildRestartLog(scope: "all" | Worker, workers: Worker[]): string[] {
  const lines: string[] = [];

  if (scope === "all") {
    lines.push(
      "$ curl -X POST https://shadowassistant.in/_internal/restart-hook",
      "",
      "[server] Restart requested via webhook",
      `[server] Draining connections… (${workers.length}/${workers.length} workers)`,
    );
    workers.forEach((w) => lines.push(`[server] Worker ${w.id} (pid ${w.pid}) stopped`));
    lines.push("[server] Spawning new worker pool…");
    workers.forEach((w) =>
      lines.push(`[server] Worker ${w.id} started (pid ${Math.floor(Math.random() * 9000) + 10000})`),
    );
  } else {
    lines.push(
      `$ curl -X POST "https://shadowassistant.in/_internal/restart-hook?worker=${scope.id}"`,
      "",
      `[server] Restart requested for worker ${scope.id}`,
      `[server] Draining connections on worker ${scope.id} (pid ${scope.pid})…`,
      `[server] Worker ${scope.id} (pid ${scope.pid}) stopped`,
      `[server] Worker ${scope.id} started (pid ${Math.floor(Math.random() * 9000) + 10000})`,
    );
  }

  lines.push(
    "[server] Health check → GET /health → 200 OK ✓",
    "",
    `[server] ✓ Restart complete (${(Math.random() * 5 + 3).toFixed(1)}s)`,
  );

  return lines;
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="server-info-item">
      <span className="server-info-label">{label}</span>
      <span className="server-info-value" title={value}>{value}</span>
    </div>
  );
}

export function ServerPage() {
  const [workers, setWorkers] = useState(INITIAL_WORKERS);
  const [history, setHistory] = useState(INITIAL_HISTORY);
  const [showRestartModal, setShowRestartModal] = useState(false);
  const [confirmWorkerId, setConfirmWorkerId] = useState<number | null>(null);

  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [jobDone, setJobDone] = useState(false);
  const logBodyRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const jobRunning = activeJob !== null && !jobDone;

  useEffect(() => {
    if (logBodyRef.current) logBodyRef.current.scrollTop = logBodyRef.current.scrollHeight;
  }, [logLines]);

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  function runRestart(scope: "all" | Worker) {
    if (intervalRef.current) clearInterval(intervalRef.current);

    const scopeId: "all" | number = scope === "all" ? "all" : scope.id;
    const label = scope === "all" ? "Restarting all workers" : `Restarting worker-${scope.id}`;
    const lines = buildRestartLog(scope, workers);

    setActiveJob({ scope: scopeId, label });
    setLogLines([]);
    setJobDone(false);
    setShowRestartModal(false);
    setConfirmWorkerId(null);

    let i = 0;
    intervalRef.current = setInterval(() => {
      setLogLines((prev) => [...prev, lines[i]]);
      i++;
      if (i >= lines.length) {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
        setJobDone(true);

        setWorkers((prev) =>
          prev.map((w) =>
            scopeId === "all" || w.id === scopeId
              ? { ...w, pid: Math.floor(Math.random() * 9000) + 10000, cpu: Math.floor(Math.random() * 10) + 5, uptime: "0m" }
              : w,
          ),
        );
        setHistory((prev) => [
          {
            id: Date.now(),
            timestamp: new Date().toLocaleString("en-US", {
              day: "2-digit", month: "short", hour: "numeric", minute: "2-digit",
            }),
            trigger: "Manual",
            initiatedBy: "Harsh Gupta · BackOffice",
            duration: `${(Math.random() * 4 + 4).toFixed(0)}s`,
            result: "success",
          },
          ...prev,
        ]);
      }
    }, 220);
  }

  return (
    <>
      <PageHeader
        icon={<CpuFill size={20} />}
        title="Server"
        subtitle="Monitor and manage the Shadow V2 host — a Termux server running on Android."
        actions={[{
          key: "restart-server",
          label: "Restart Server",
          icon: <ArrowClockwise size={15} />,
          onClick: () => setShowRestartModal(true),
          disabled: jobRunning,
        }]}
      />

      <div className="dp-stats">
        <StatCard variant="brand" value="6d 14h" name="Server Uptime" hint="Since last restart" />
        <StatCard variant="success" value="38%" name="CPU Load" hint="4 workers active" />
        <StatCard variant="info" value="3.2/8 GB" name="Memory Used" hint="40% utilized" />
        <StatCard variant="warn" value="76%" name="Battery" hint="Charging · Wi-Fi" />
      </div>

      {activeJob && (
        <div className="deploy-log-wrap">
          <div className="deploy-log-header">
            <div className="d-flex align-items-center gap-2">
              <Terminal size={13} />
              <span>{activeJob.label}</span>
              {jobDone
                ? <span className="deploy-log-badge deploy-log-badge--ok">Done</span>
                : <span className="deploy-log-badge deploy-log-badge--running">Running</span>}
            </div>
            {jobDone && (
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => setActiveJob(null)}>
                <XLg size={13} />
              </button>
            )}
          </div>
          <div className="deploy-log-body" ref={logBodyRef}>
            {logLines.map((line, i) => (
              <div key={i} className="deploy-log-line">{line || " "}</div>
            ))}
            {!jobDone && <span className="deploy-log-cursor" />}
          </div>
        </div>
      )}

      <div className="server-grid-2col">
        <div className="server-card">
          <h3 className="server-card-title">
            <PhoneFill size={16} />
            Device &amp; Host
          </h3>
          <div className="server-info-grid">
            <InfoItem label="Host" value="Termux · Android 14" />
            <InfoItem label="Runtime" value="Python 3.12 · Uvicorn" />
            <InfoItem label="App server" value="FastAPI (4 workers)" />
            <InfoItem label="Public endpoint" value="shadowassistant.in" />
            <InfoItem label="Tunnel" value="Cloudflare Tunnel" />
            <InfoItem label="Auto-start" value="Termux:Boot enabled" />
            <InfoItem label="Wake lock" value="Active" />
            <InfoItem label="Last restart" value="18 Sep 2026, 06:12 AM" />
          </div>
        </div>

        <div className="server-card">
          <h3 className="server-card-title">
            <ShieldFillCheck size={16} />
            Health &amp; Network
          </h3>
          <div className="server-info-grid">
            <InfoItem label="Network" value="Wi-Fi · 92 Mbps" />
            <InfoItem label="Signal" value="Strong" />
            <InfoItem label="Thermal state" value="Normal (34°C)" />
            <InfoItem label="Storage" value="42 / 128 GB (33%)" />
            <InfoItem label="Requests (1h)" value="1,284" />
            <InfoItem label="Avg response" value="142 ms" />
            <InfoItem label="Error rate (5xx)" value="0.2%" />
            <InfoItem label="Battery health" value="Good" />
          </div>
        </div>
      </div>

      <div className="server-section">
        <h2 className="server-section-title">Workers</h2>
        <div className="dp-table-wrap">
          <table className="dp-table">
            <thead>
              <tr>
                <th>Worker</th>
                <th>PID</th>
                <th>Status</th>
                <th>CPU</th>
                <th>Memory</th>
                <th>Requests</th>
                <th>Uptime</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => {
                const isRestarting = jobRunning && (activeJob!.scope === "all" || activeJob!.scope === w.id);
                return (
                  <Fragment key={w.id}>
                    <tr>
                      <td style={{ fontWeight: 600 }}>worker-{w.id}</td>
                      <td style={{ color: "var(--jv-muted)" }}>{w.pid}</td>
                      <td>
                        <span className={`dp-status-dot dp-status-dot--${isRestarting ? "warn" : "success"}`}>
                          {isRestarting ? "Restarting" : "Running"}
                        </span>
                      </td>
                      <td style={{ color: "var(--jv-muted)" }}>{w.cpu}%</td>
                      <td style={{ color: "var(--jv-muted)" }}>{w.memoryMb} MB</td>
                      <td style={{ color: "var(--jv-muted)" }}>{w.requests}</td>
                      <td style={{ color: "var(--jv-muted)" }}>{w.uptime}</td>
                      <td>
                        <button
                          type="button"
                          className="btn-action btn-action--ghost"
                          disabled={jobRunning}
                          onClick={() => setConfirmWorkerId(confirmWorkerId === w.id ? null : w.id)}
                        >
                          <ArrowRepeat size={12} />
                          Restart
                        </button>
                      </td>
                    </tr>
                    {confirmWorkerId === w.id && (
                      <tr className="dp-confirm-row">
                        <td colSpan={8}>
                          <div className="dp-confirm-inner">
                            <span>Restart <strong>worker-{w.id}</strong> (pid {w.pid})?</span>
                            <button type="button" className="btn-action btn-action--danger" onClick={() => runRestart(w)}>
                              Yes, restart
                            </button>
                            <button type="button" className="btn-action btn-action--ghost" onClick={() => setConfirmWorkerId(null)}>
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="server-section">
        <h2 className="server-section-title">Recent Restarts</h2>
        <div className="dp-table-wrap">
          <table className="dp-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Trigger</th>
                <th>Initiated By</th>
                <th>Duration</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td style={{ color: "var(--jv-muted)", whiteSpace: "nowrap" }}>{h.timestamp}</td>
                  <td>{h.trigger}</td>
                  <td style={{ color: "var(--jv-muted)" }}>{h.initiatedBy}</td>
                  <td style={{ color: "var(--jv-muted)" }}>{h.duration}</td>
                  <td>
                    <span className={`dp-status-dot dp-status-dot--${h.result === "success" ? "success" : "danger"}`}>
                      {h.result === "success" ? "Success" : "Failed"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="server-section">
        <h2 className="server-section-title">Live Log Tail</h2>
        <LiveLogTail />
      </div>

      <Modal show={showRestartModal} onHide={() => setShowRestartModal(false)} centered className="deploy-modal">
        <Modal.Header>
          <h5 className="deploy-modal-title">Restart all workers?</h5>
          <button type="button" className="btn btn-ghost btn-icon" onClick={() => setShowRestartModal(false)} aria-label="Close">
            <XLg size={14} />
          </button>
        </Modal.Header>
        <Modal.Body>
          <p className="mb-0" style={{ fontSize: "0.88rem", color: "var(--jv-muted)" }}>
            This sends a restart signal to all 4 worker processes via the deploy webhook.
            In-flight requests may be dropped for a few seconds while workers restart.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <button type="button" className="btn btn-ghost" onClick={() => setShowRestartModal(false)}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger d-flex align-items-center gap-2" onClick={() => runRestart("all")}>
            <ArrowClockwise size={14} />
            Restart all workers
          </button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
