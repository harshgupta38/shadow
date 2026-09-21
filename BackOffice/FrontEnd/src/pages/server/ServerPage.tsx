import { useEffect, useRef, useState } from "react";
import { Modal } from "react-bootstrap";
import {
  CpuFill,
  ArrowClockwise,
  Terminal,
  Wifi,
  WifiOff,
  XLg,
  ShieldFillCheck,
} from "react-bootstrap-icons";
import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import { StatCard } from "@/components/ui/StatCard/StatCard";
import { api, ApiError } from "@/api";
import type { RestartLog, ServerHealth } from "@/api";
import { formatDateTime, statusLabel, statusVariant, formatUptime } from "@/lib/format";
import { LiveLogTail } from "./LiveLogTail";

// Every poll runs psutil process/CPU sampling on BackOffice's side plus a
// request to BackEnd_V2 — 6s was hammering a server running on a phone for
// data that doesn't meaningfully change that often.
const HEALTH_POLL_MS = 15000;
const RESTART_POLL_MS = 1500;

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="server-info-item">
      <span className="server-info-label">{label}</span>
      <span className="server-info-value" title={value}>{value}</span>
    </div>
  );
}

function fmtPercent(n: number | null): string {
  return n == null ? "Unavailable" : `${n.toFixed(0)}%`;
}

export function ServerPage() {
  const [health, setHealth] = useState<ServerHealth | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [history, setHistory] = useState<RestartLog[]>([]);
  const [showRestartModal, setShowRestartModal] = useState(false);

  const [activeJob, setActiveJob] = useState<RestartLog | null>(null);
  const restartPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logBodyRef = useRef<HTMLDivElement>(null);
  const jobRunning = activeJob !== null && activeJob.status === "running";

  async function loadHealth() {
    try {
      const h = await api.server.health();
      setHealth(h);
      setHealthError(null);
    } catch (err) {
      setHealthError(err instanceof ApiError ? err.message : "Could not reach the BackOffice API.");
    }
  }

  async function loadHistory() {
    try {
      const list = await api.server.restartHistory(1, 10);
      setHistory(list);
    } catch {
      // the stat cards / health panel already surface a connectivity error
    }
  }

  useEffect(() => {
    loadHealth();
    loadHistory();
    const interval = setInterval(loadHealth, HEALTH_POLL_MS);
    return () => {
      clearInterval(interval);
      if (restartPollRef.current) clearInterval(restartPollRef.current);
    };
  }, []);

  useEffect(() => {
    if (logBodyRef.current) logBodyRef.current.scrollTop = logBodyRef.current.scrollHeight;
  }, [activeJob?.log_output]);

  function pollRestart(id: number) {
    if (restartPollRef.current) clearInterval(restartPollRef.current);
    restartPollRef.current = setInterval(async () => {
      try {
        const record = await api.server.restartDetail(id);
        setActiveJob(record);
        if (record.status !== "running") {
          clearInterval(restartPollRef.current!);
          restartPollRef.current = null;
          loadHealth();
          loadHistory();
        }
      } catch {
        // transient hiccup — the interval will retry
      }
    }, RESTART_POLL_MS);
  }

  async function handleRestart() {
    setShowRestartModal(false);
    try {
      const record = await api.server.restart();
      setActiveJob(record);
      pollRestart(record.id);
    } catch (err) {
      setHealthError(err instanceof ApiError ? err.message : "Could not start the restart.");
    }
  }

  const oldestWorkerUptime = health?.workers.length
    ? Math.max(...health.workers.map((w) => w.uptime_seconds))
    : null;

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

      {healthError && (
        <div className="alert alert-danger py-2 px-3 small mb-3" role="alert">{healthError}</div>
      )}

      <div className="dp-stats">
        <StatCard
          variant={health?.reachable ? "success" : "warn"}
          value={health ? (health.reachable ? "Online" : "Unreachable") : "…"}
          name="Server Status"
          hint={health?.message ?? "No data yet"}
        />
        <StatCard
          variant="success"
          value={
            health?.cpu_percent != null ? fmtPercent(health.cpu_percent)
            : health?.load_average?.[0] != null ? `${health.load_average[0].toFixed(2)} load`
            : "Unavailable"
          }
          name="CPU Load"
          hint={
            !health ? "—"
            : `${health.workers.length} worker${health.workers.length === 1 ? "" : "s"} active` +
              (health.load_average ? ` · load avg ${health.load_average.join(" / ")}` : "")
          }
        />
        <StatCard
          variant="info"
          value={health?.memory_used_mb != null && health.memory_total_mb != null
            ? `${(health.memory_used_mb / 1024).toFixed(1)}/${(health.memory_total_mb / 1024).toFixed(1)} GB`
            : "Unavailable"}
          name="Memory Used"
          hint={fmtPercent(health?.memory_percent ?? null) + " utilized"}
        />
        <StatCard
          variant="warn"
          value={health?.battery_percent != null ? `${health.battery_percent}%` : "Unavailable"}
          name="Battery"
          hint={health?.battery_status ?? "termux-api not detected"}
        />
      </div>

      {activeJob && (
        <div className="deploy-log-wrap">
          <div className="deploy-log-header">
            <div className="d-flex align-items-center gap-2">
              <Terminal size={13} />
              <span>Restarting server</span>
              {jobRunning
                ? <span className="deploy-log-badge deploy-log-badge--running">Running</span>
                : <span className="deploy-log-badge deploy-log-badge--ok">{statusLabel(activeJob.status)}</span>}
            </div>
            {!jobRunning && (
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => setActiveJob(null)}>
                <XLg size={13} />
              </button>
            )}
          </div>
          <div className="deploy-log-body" ref={logBodyRef}>
            {activeJob.log_output ? (
              activeJob.log_output.split("\n").map((line, i) => (
                <div key={i} className="deploy-log-line">{line || " "}</div>
              ))
            ) : (
              <div className="deploy-log-line">Waiting for the restart to complete…</div>
            )}
            {jobRunning && <span className="deploy-log-cursor" />}
          </div>
        </div>
      )}

      <div className="server-grid-2col">
        <div className="server-card">
          <h3 className="server-card-title">
            <ShieldFillCheck size={16} />
            System
          </h3>
          <div className="server-info-grid">
            <InfoItem label="Disk Used" value={health?.disk_used_gb != null && health.disk_total_gb != null
              ? `${health.disk_used_gb} / ${health.disk_total_gb} GB`
              : "Unavailable"} />
            <InfoItem label="Disk Usage" value={fmtPercent(health?.disk_percent ?? null)} />
            <InfoItem label="Battery Status" value={health?.battery_status ?? "Unavailable"} />
            <InfoItem label="Battery Temp" value={health?.battery_temperature_c != null ? `${health.battery_temperature_c}°C` : "Unavailable"} />
            <InfoItem label="Power Source" value={health?.battery_plugged ?? "Unavailable"} />
            <InfoItem label="Server Uptime" value={formatUptime(oldestWorkerUptime)} />
            <InfoItem
              label="Workers Running"
              value={
                !health ? "—"
                : health.expected_workers != null ? `${health.workers.length} of ${health.expected_workers}`
                : String(health.workers.length)
              }
            />
          </div>
        </div>

        <div className="server-card">
          <h3 className="server-card-title">
            {health?.wifi_ssid ? <Wifi size={16} /> : <WifiOff size={16} />}
            Network
          </h3>
          <div className="server-info-grid">
            <InfoItem label="WiFi Network" value={health?.wifi_ssid ?? "Not connected"} />
            <InfoItem label="Signal Strength" value={health?.wifi_rssi != null ? `${health.wifi_rssi} dBm` : "Unavailable"} />
            <InfoItem label="Link Speed" value={health?.wifi_link_speed_mbps != null ? `${health.wifi_link_speed_mbps} Mbps` : "Unavailable"} />
            <InfoItem label="IP Address" value={health?.wifi_ip ?? "Unavailable"} />
          </div>
          {health && !health.wifi_ssid && (
            <p className="page-subtitle text-muted-2" style={{ marginTop: "0.75rem", marginBottom: 0, fontSize: "0.78rem" }}>
              Not on WiFi — either on mobile data, or Termux:API isn't installed on the device.
            </p>
          )}
        </div>
      </div>

      <div className="server-section">
        <h2 className="server-section-title">Workers</h2>
        <p className="page-subtitle text-muted-2" style={{ marginTop: "-0.5rem", marginBottom: "0.9rem" }}>
          uvicorn's worker pool restarts as one unit — there's no way to restart a single worker independently.
        </p>
        <div className="dp-table-wrap">
          <table className="dp-table">
            <thead>
              <tr>
                <th>PID</th>
                <th>Status</th>
                <th>CPU</th>
                <th>Memory</th>
                <th>Uptime</th>
              </tr>
            </thead>
            <tbody>
              {!health || health.workers.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", color: "var(--jv-faint)", padding: "1.5rem" }}>
                    {health ? "No workers detected — is the server running?" : "Loading…"}
                  </td>
                </tr>
              ) : (
                health.workers.map((w) => (
                  <tr key={w.pid}>
                    <td style={{ fontWeight: 600 }}>{w.pid}</td>
                    <td>
                      <span className={`dp-status-dot dp-status-dot--${jobRunning ? "warn" : "success"}`}>
                        {jobRunning ? "Restarting" : "Running"}
                      </span>
                    </td>
                    <td style={{ color: "var(--jv-muted)" }}>{w.cpu_percent}%</td>
                    <td style={{ color: "var(--jv-muted)" }}>{w.memory_mb.toFixed(0)} MB</td>
                    <td style={{ color: "var(--jv-muted)" }}>{formatUptime(w.uptime_seconds)}</td>
                  </tr>
                ))
              )}
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
              {history.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", color: "var(--jv-faint)", padding: "1.5rem" }}>
                    No restarts logged yet.
                  </td>
                </tr>
              ) : (
                history.map((h) => (
                  <tr key={h.id}>
                    <td style={{ color: "var(--jv-muted)", whiteSpace: "nowrap" }}>{formatDateTime(h.started_at)}</td>
                    <td style={{ textTransform: "capitalize" }}>{h.trigger}</td>
                    <td style={{ color: "var(--jv-muted)" }}>{h.initiated_by}</td>
                    <td style={{ color: "var(--jv-muted)" }}>{h.duration_seconds != null ? `${h.duration_seconds.toFixed(1)}s` : "—"}</td>
                    <td>
                      <span className={`dp-status-dot dp-status-dot--${statusVariant(h.status)}`}>
                        {statusLabel(h.status)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
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
          <h5 className="deploy-modal-title">Restart the server?</h5>
          <button type="button" className="btn btn-ghost btn-icon" onClick={() => setShowRestartModal(false)} aria-label="Close">
            <XLg size={14} />
          </button>
        </Modal.Header>
        <Modal.Body>
          <p className="mb-0" style={{ fontSize: "0.88rem", color: "var(--jv-muted)" }}>
            This runs restart_server.sh directly (no code changes are pulled). All worker
            processes restart together — in-flight requests may be dropped for a few seconds.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <button type="button" className="btn btn-ghost" onClick={() => setShowRestartModal(false)}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger d-flex align-items-center gap-2" onClick={handleRestart}>
            <ArrowClockwise size={14} />
            Restart server
          </button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
