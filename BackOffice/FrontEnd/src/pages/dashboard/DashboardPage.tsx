import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { StatCard } from "@/components/ui/StatCard/StatCard";
import { api } from "@/api";
import type { Deployment, RestartLog, ServerHealth } from "@/api";
import { formatDate, formatRelative, formatUptime, statusLabel, statusVariant } from "@/lib/format";

export function DashboardPage() {
  const { user } = useAuth();

  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [health, setHealth] = useState<ServerHealth | null>(null);
  const [lastRestart, setLastRestart] = useState<RestartLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const [deploysResult, healthResult, restartResult] = await Promise.allSettled([
        api.deploy.history(1, 5),
        api.server.health(),
        api.server.restartHistory(1, 1),
      ]);

      if (cancelled) return;

      if (deploysResult.status === "fulfilled") setDeployments(deploysResult.value);
      if (healthResult.status === "fulfilled") setHealth(healthResult.value);
      if (restartResult.status === "fulfilled") setLastRestart(restartResult.value[0] ?? null);

      if (deploysResult.status === "rejected" && healthResult.status === "rejected") {
        setError("Could not reach the BackOffice API.");
      } else {
        setError(null);
      }

      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const lastDeployment = deployments[0];
  const oldestWorkerUptime = health?.workers.length
    ? Math.max(...health.workers.map((w) => w.uptime_seconds))
    : null;

  return (
    <>
      {/* Header */}
      <div className="mb-4">
        <h1 className="page-title">{greeting}, {user?.username ?? "Admin"}</h1>
        <p className="page-subtitle text-muted-2 mb-0">Here's your system overview for today.</p>
      </div>

      {error && (
        <div className="alert alert-danger py-2 px-3 small mb-3" role="alert">
          {error}
        </div>
      )}

      {/* Stat cards */}
      <div className="dp-stats">
        <StatCard
          variant={lastDeployment ? statusVariant(lastDeployment.status) : "brand"}
          value={lastDeployment ? lastDeployment.label : loading ? "…" : "—"}
          name="Last Deployment"
          hint={lastDeployment ? `${lastDeployment.target} · ${formatRelative(lastDeployment.started_at)}` : "No deployments yet"}
        />
        <StatCard
          variant={health?.reachable ? "success" : "warn"}
          value={health ? (health.reachable ? "Online" : "Unreachable") : loading ? "…" : "—"}
          name="Server Status"
          hint={health?.cpu_percent != null ? `CPU ${health.cpu_percent.toFixed(0)}%` : "No data"}
        />
        <StatCard
          variant={lastRestart ? statusVariant(lastRestart.status) : "info"}
          value={lastRestart ? statusLabel(lastRestart.status) : loading ? "…" : "None yet"}
          name="Last Restart"
          hint={lastRestart ? formatRelative(lastRestart.started_at) : "No restarts logged"}
        />
        <StatCard
          variant="warn"
          value={formatUptime(oldestWorkerUptime)}
          name="Server Uptime"
          hint={health?.workers.length ? `${health.workers.length} worker${health.workers.length === 1 ? "" : "s"} running` : "No workers detected"}
        />
      </div>

      {/* Recent deployments */}
      <div>
        <h2 className="dp-section-title">Recent Deployments</h2>
        <div className="dp-table-wrap">
          <table className="dp-table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Target</th>
                <th>Date</th>
                <th>Triggered By</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {deployments.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", color: "var(--jv-faint)", padding: "1.5rem" }}>
                    {loading ? "Loading…" : "No deployments yet."}
                  </td>
                </tr>
              ) : (
                deployments.map((d) => (
                  <tr key={d.id}>
                    <td><span className="dp-tag">{d.label}</span></td>
                    <td style={{ color: "var(--jv-muted)" }}>{d.target}</td>
                    <td style={{ color: "var(--jv-muted)" }}>{formatDate(d.started_at)}</td>
                    <td style={{ color: "var(--jv-muted)" }}>{d.triggered_by}</td>
                    <td>
                      <span className={`dp-status-dot dp-status-dot--${statusVariant(d.status)}`}>
                        {statusLabel(d.status)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
