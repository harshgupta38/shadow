import { CloudArrowDownFill, PlusLg } from "react-bootstrap-icons";
import { formatDateTime, statusLabel, statusVariant } from "@/lib/format";

interface MockBackup {
  id: number;
  name: string;
  created_at: string;
  size: string;
  status: "success" | "running" | "failed";
}

// Layout preview only — Backups has no backend yet, so this is fixed mock
// data standing in until the real feature (and its data shape) is defined.
const MOCK_BACKUPS: MockBackup[] = [
  { id: 5, name: "Manual backup", created_at: "2026-09-20T09:12:00Z", size: "182 MB", status: "running" },
  { id: 4, name: "Daily backup", created_at: "2026-09-20T02:00:00Z", size: "179 MB", status: "success" },
  { id: 3, name: "Daily backup", created_at: "2026-09-19T02:00:00Z", size: "177 MB", status: "success" },
  { id: 2, name: "Pre-deploy backup", created_at: "2026-09-18T14:41:00Z", size: "174 MB", status: "failed" },
  { id: 1, name: "Daily backup", created_at: "2026-09-18T02:00:00Z", size: "173 MB", status: "success" },
];

export function BackupsTab() {
  return (
    <>
      <div className="db-toolbar">
        <div className="min-w-0">
          <h2 className="db-table-title">Backups</h2>
          <p className="db-table-meta">Snapshots of shadow.db. Layout preview — not wired up yet.</p>
        </div>
        <div className="db-toolbar-actions">
          <button
            type="button"
            className="btn btn-brand text-nowrap d-flex align-items-center gap-2"
            disabled
            title="Coming soon"
          >
            <PlusLg size={14} />
            Create backup
          </button>
        </div>
      </div>

      <div className="dp-table-wrap">
        <table className="dp-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Created</th>
              <th>Size</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_BACKUPS.map((b) => (
              <tr key={b.id}>
                <td style={{ fontWeight: 600 }}>{b.name}</td>
                <td style={{ color: "var(--jv-muted)", whiteSpace: "nowrap" }}>{formatDateTime(b.created_at)}</td>
                <td style={{ color: "var(--jv-muted)" }}>{b.size}</td>
                <td>
                  <span className={`dp-status-dot dp-status-dot--${statusVariant(b.status)}`}>
                    {statusLabel(b.status)}
                  </span>
                </td>
                <td>
                  <div className="d-flex gap-1">
                    <button type="button" className="btn-action btn-action--ghost" disabled title="Coming soon">
                      <CloudArrowDownFill size={12} />
                      Download
                    </button>
                    <button type="button" className="btn-action btn-action--ghost" disabled title="Coming soon">
                      Restore
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
