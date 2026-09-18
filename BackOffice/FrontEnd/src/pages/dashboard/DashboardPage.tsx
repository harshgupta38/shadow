import { useAuth } from "@/context/AuthContext";

interface StatCardProps {
  variant: "success" | "warn" | "info" | "brand";
  value: string;
  name: string;
  hint: string;
}

function StatCard({ variant, value, name, hint }: StatCardProps) {
  return (
    <div className={`dp-stat dp-stat--${variant}`}>
      <span className="dp-stat-val">{value}</span>
      <div className="dp-stat-text">
        <span className="dp-stat-name">{name}</span>
        <span className="dp-stat-hint">{hint}</span>
      </div>
    </div>
  );
}

const RECENT_DEPLOYMENTS = [
  { tag: "v2.4.1", target: "Both targets",     date: "18 Sep 2026", duration: "142s", status: "success" as const },
  { tag: "v2.4.0", target: "Frontend only",    date: "15 Sep 2026", duration: "98s",  status: "success" as const },
  { tag: "v2.3.9", target: "Both targets",     date: "10 Sep 2026", duration: "155s", status: "success" as const },
  { tag: "v2.3.8", target: "Backend only",     date: "04 Sep 2026", duration: "61s",  status: "success" as const },
  { tag: "v2.3.7", target: "Both targets",     date: "28 Aug 2026", duration: "133s", status: "warn"    as const },
];

export function DashboardPage() {
  const { user } = useAuth();

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <>
      {/* Header */}
      <div className="dp-header">
        <div>
          <h1 className="dp-heading">{greeting}, {user?.username ?? "Admin"}</h1>
          <p className="dp-subheading">Here's your system overview for today.</p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="dp-stats">
        <StatCard variant="brand"   value="v2.4.1"   name="Last Deployment" hint="Both targets · 18 Sep" />
        <StatCard variant="success" value="24%"       name="Server Health"   hint="Online · 10d uptime"  />
        <StatCard variant="info"    value="14.2 MB"   name="Last DB Backup"  hint="Today · 02:00 AM"     />
        <StatCard variant="warn"    value="10d 4h"    name="Server Uptime"   hint="Since 08 Sep 2026"    />
      </div>

      {/* Recent deployments */}
      <div>
        <h2 className="dp-section-title">Recent Deployments</h2>
        <div className="dp-table-wrap">
          <table className="dp-table">
            <thead>
              <tr>
                <th>Tag</th>
                <th>Target</th>
                <th>Date</th>
                <th>Duration</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {RECENT_DEPLOYMENTS.map((d) => (
                <tr key={d.tag + d.date}>
                  <td>
                    <span
                      style={{
                        fontFamily: "var(--jv-font-display)",
                        fontWeight: 700,
                        fontSize: "0.82rem",
                        background: "var(--jv-brand-soft)",
                        color: "var(--jv-brand-1)",
                        borderRadius: 6,
                        padding: "0.15rem 0.5rem",
                      }}
                    >
                      {d.tag}
                    </span>
                  </td>
                  <td style={{ color: "var(--jv-muted)" }}>{d.target}</td>
                  <td style={{ color: "var(--jv-muted)" }}>{d.date}</td>
                  <td style={{ color: "var(--jv-muted)" }}>{d.duration}</td>
                  <td>
                    <span
                      className={`dp-status-dot dp-status-dot--${d.status}`}
                    >
                      {d.status === "success" ? "Success" : "Partial"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
