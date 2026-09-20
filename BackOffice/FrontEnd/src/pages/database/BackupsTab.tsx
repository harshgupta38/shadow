import { useEffect, useState } from "react";
import { Modal } from "react-bootstrap";
import { ArrowCounterclockwise, CloudArrowDownFill, Inbox, PlusLg } from "react-bootstrap-icons";
import { api, ApiError } from "@/api";
import type { BackupInfo } from "@/api";
import { downloadBlob } from "@/lib/download";
import { formatDateTime, formatFileSize } from "@/lib/format";
import { useToast } from "@/context/ToastContext";

export function BackupsTab() {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [downloadingName, setDownloadingName] = useState<string | null>(null);
  const [restoringName, setRestoringName] = useState<string | null>(null);
  const [confirmingRestore, setConfirmingRestore] = useState<BackupInfo | null>(null);
  const { success, error: toastError } = useToast();

  // One restore/create/download at a time — overlapping two operations that
  // both touch the live database file is exactly the kind of thing this
  // page needs to avoid, not just allow to race.
  const busy = creating || downloadingName !== null || restoringName !== null;

  async function loadBackups() {
    setLoading(true);
    try {
      const list = await api.database.listBackups();
      setBackups(list);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load backups.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBackups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreateBackup() {
    setCreating(true);
    try {
      await api.database.createBackup();
      success("Backup created.");
      await loadBackups();
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : "Could not create a backup.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDownload(name: string) {
    setDownloadingName(name);
    try {
      const blob = await api.database.downloadBackup(name);
      downloadBlob(blob, name);
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : "Could not download this backup.");
    } finally {
      setDownloadingName(null);
    }
  }

  async function handleConfirmRestore() {
    if (!confirmingRestore) return;
    const name = confirmingRestore.name;
    setConfirmingRestore(null);
    setRestoringName(name);
    try {
      const result = await api.database.restoreBackup(name);
      success(
        `Restored from ${result.restored_from}. The previous database was saved as ${result.pre_restore_backup.name} first.`,
      );
      await loadBackups();
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : "Could not restore this backup.");
    } finally {
      setRestoringName(null);
    }
  }

  return (
    <>
      <div className="db-toolbar">
        <div className="min-w-0">
          <h2 className="db-table-title">Backups</h2>
          <p className="db-table-meta">Snapshots of shadow.db, taken automatically every day and on demand.</p>
        </div>
        <div className="db-toolbar-actions">
          <button
            type="button"
            className="btn btn-soft text-nowrap d-flex align-items-center gap-2"
            onClick={handleCreateBackup}
            disabled={busy}
          >
            {creating ? <span className="spinner-border spinner-border-sm" /> : <PlusLg size={14} />}
            {creating ? "Creating…" : "Create backup"}
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger py-2 px-3 small mb-3" role="alert">{error}</div>
      )}

      {backups.length === 0 ? (
        <div className="db-empty-state">
          <Inbox size={30} />
          <p>{loading ? "Loading…" : "No backups yet."}</p>
        </div>
      ) : (
        <div className="dp-table-wrap">
          <table className="dp-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Created</th>
                <th>Size</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((b) => (
                <tr key={b.name}>
                  <td style={{ fontFamily: "Menlo, Consolas, monospace", fontSize: "0.82rem" }}>{b.name}</td>
                  <td style={{ color: "var(--jv-muted)", whiteSpace: "nowrap" }}>{formatDateTime(b.created_at)}</td>
                  <td style={{ color: "var(--jv-muted)" }}>{formatFileSize(b.size_bytes)}</td>
                  <td>
                    <div className="d-flex gap-1">
                      <button
                        type="button"
                        className="btn-action btn-action--ghost"
                        onClick={() => handleDownload(b.name)}
                        disabled={busy}
                      >
                        <CloudArrowDownFill size={12} />
                        {downloadingName === b.name ? "Downloading…" : "Download"}
                      </button>
                      <button
                        type="button"
                        className="btn-action btn-action--ghost"
                        onClick={() => setConfirmingRestore(b)}
                        disabled={busy}
                      >
                        <ArrowCounterclockwise size={12} />
                        {restoringName === b.name ? "Restoring…" : "Restore"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmingRestore && (
        <Modal show onHide={() => setConfirmingRestore(null)} centered className="deploy-modal">
          <Modal.Header>
            <h5 className="deploy-modal-title">Restore this backup?</h5>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              onClick={() => setConfirmingRestore(null)}
              aria-label="Close"
            >
              ×
            </button>
          </Modal.Header>
          <Modal.Body>
            <p className="mb-2">
              Restoring <strong>{confirmingRestore.name}</strong> will overwrite the live database with this
              backup's data. Every user-facing change made since {formatDateTime(confirmingRestore.created_at)} will
              be lost.
            </p>
            <p className="mb-0">
              A safety backup of the <strong>current</strong> database will be created automatically first, so
              tonight's state isn't gone for good — but the restore itself can't be undone once started.
            </p>
          </Modal.Body>
          <Modal.Footer>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmingRestore(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-danger" onClick={handleConfirmRestore}>
              Yes, restore
            </button>
          </Modal.Footer>
        </Modal>
      )}
    </>
  );
}
