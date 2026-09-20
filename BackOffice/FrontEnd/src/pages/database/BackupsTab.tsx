import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Dropdown, Modal } from "react-bootstrap";
import {
  ArrowCounterclockwise,
  BoxArrowUpRight,
  CloudArrowDownFill,
  Inbox,
  PlusLg,
  ThreeDotsVertical,
  TrashFill,
} from "react-bootstrap-icons";
import { api, ApiError } from "@/api";
import type { BackupInfo } from "@/api";
import { downloadBlob } from "@/lib/download";
import { formatDateTime, formatFileSize } from "@/lib/format";
import { useToast } from "@/context/ToastContext";

export function BackupsTab({ onOpenBackup }: { onOpenBackup: (filename: string) => void }) {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [downloadingName, setDownloadingName] = useState<string | null>(null);
  const [restoringName, setRestoringName] = useState<string | null>(null);
  const [deletingName, setDeletingName] = useState<string | null>(null);
  const [confirmingRestore, setConfirmingRestore] = useState<BackupInfo | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<BackupInfo | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; backup: BackupInfo } | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState<{ top: number; left: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const { success, error: toastError } = useToast();

  // Desktop drops the per-row "⋮" in favor of right-clicking the row — the
  // same four actions, just reached the way a file browser's context menu
  // works instead of an always-visible trigger. Closes on an outside click,
  // Escape, or scroll (a stale fixed-position menu left behind mid-scroll
  // would float over the wrong row).
  useEffect(() => {
    if (!contextMenu) return;
    function handleMouseDown(e: MouseEvent) {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setContextMenu(null);
    }
    function handleScroll() {
      setContextMenu(null);
    }
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("scroll", handleScroll, true);
    };
  }, [contextMenu]);

  // Keeps the menu on-screen — a row right-clicked near the bottom/right
  // edge would otherwise render partly off the viewport. Renders once at
  // the raw cursor position (needed to measure it), then this corrects the
  // position before paint, so there's no visible jump.
  useLayoutEffect(() => {
    if (!contextMenu || !contextMenuRef.current) {
      setContextMenuPos(null);
      return;
    }
    const rect = contextMenuRef.current.getBoundingClientRect();
    const top = Math.max(8, Math.min(contextMenu.y, window.innerHeight - rect.height - 8));
    const left = Math.max(8, Math.min(contextMenu.x, window.innerWidth - rect.width - 8));
    setContextMenuPos({ top, left });
  }, [contextMenu]);

  // One restore/create/download/delete at a time — overlapping two operations
  // that both touch the live database file (or the backup archive) is
  // exactly the kind of thing this page needs to avoid, not just allow to race.
  const busy = creating || downloadingName !== null || restoringName !== null || deletingName !== null;

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

  async function handleConfirmDelete() {
    if (!confirmingDelete) return;
    const name = confirmingDelete.name;
    setConfirmingDelete(null);
    setDeletingName(name);
    try {
      await api.database.deleteBackup(name);
      success(`Deleted ${name}.`);
      await loadBackups();
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : "Could not delete this backup.");
    } finally {
      setDeletingName(null);
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
          <table className="dp-table db-grid--clickable">
            <thead>
              <tr>
                <th>Created</th>
                <th>Name</th>
                <th>Size</th>
                <th className="dp-table-th-actions" />
              </tr>
            </thead>
            <tbody>
              {backups.map((b) => (
                <tr
                  key={b.name}
                  onClick={() => onOpenBackup(b.name)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ x: e.clientX, y: e.clientY, backup: b });
                  }}
                >
                  <td style={{ color: "var(--jv-muted)", whiteSpace: "nowrap", width: "1%" }}>{formatDateTime(b.created_at)}</td>
                  <td style={{ fontFamily: "Menlo, Consolas, monospace", fontSize: "0.82rem" }}>{b.name}</td>
                  <td style={{ color: "var(--jv-muted)", whiteSpace: "nowrap", width: "1%" }}>{formatFileSize(b.size_bytes)}</td>
                  <td className="dp-table-td-actions" onClick={(e) => e.stopPropagation()}>
                    {/* Mobile only — desktop uses the row's right-click context menu instead. */}
                    <Dropdown align="end" className="d-md-none">
                      <Dropdown.Toggle
                        as="button"
                        className="btn-action btn-action--icon"
                        id={`backup-actions-${b.name}`}
                        disabled={busy}
                      >
                        <ThreeDotsVertical size={14} />
                      </Dropdown.Toggle>
                      <Dropdown.Menu popperConfig={{ strategy: "fixed" }}>
                        <Dropdown.Item className="d-flex align-items-center gap-2" onClick={() => onOpenBackup(b.name)}>
                          <BoxArrowUpRight size={14} /> Open
                        </Dropdown.Item>
                        <Dropdown.Item className="d-flex align-items-center gap-2" onClick={() => handleDownload(b.name)}>
                          <CloudArrowDownFill size={14} />
                          {downloadingName === b.name ? "Downloading…" : "Download"}
                        </Dropdown.Item>
                        <Dropdown.Item className="d-flex align-items-center gap-2" onClick={() => setConfirmingRestore(b)}>
                          <ArrowCounterclockwise size={14} />
                          {restoringName === b.name ? "Restoring…" : "Restore"}
                        </Dropdown.Item>
                        <Dropdown.Divider />
                        <Dropdown.Item
                          className="d-flex align-items-center gap-2 text-danger"
                          onClick={() => setConfirmingDelete(b)}
                        >
                          <TrashFill size={14} />
                          {deletingName === b.name ? "Deleting…" : "Delete"}
                        </Dropdown.Item>
                      </Dropdown.Menu>
                    </Dropdown>
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

      {confirmingDelete && (
        <Modal show onHide={() => setConfirmingDelete(null)} centered className="deploy-modal">
          <Modal.Header>
            <h5 className="deploy-modal-title">Delete this backup?</h5>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              onClick={() => setConfirmingDelete(null)}
              aria-label="Close"
            >
              ×
            </button>
          </Modal.Header>
          <Modal.Body>
            <p className="mb-0">
              <strong>{confirmingDelete.name}</strong> ({formatFileSize(confirmingDelete.size_bytes)}, created{" "}
              {formatDateTime(confirmingDelete.created_at)}) will be permanently deleted. This can't be undone.
            </p>
          </Modal.Body>
          <Modal.Footer>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmingDelete(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-danger" onClick={handleConfirmDelete}>
              Yes, delete
            </button>
          </Modal.Footer>
        </Modal>
      )}

      {contextMenu && createPortal(
        <div
          ref={contextMenuRef}
          className="dropdown-menu show"
          style={{
            position: "fixed",
            top: contextMenuPos?.top ?? contextMenu.y,
            left: contextMenuPos?.left ?? contextMenu.x,
            visibility: contextMenuPos ? "visible" : "hidden",
          }}
        >
          <button
            type="button"
            className="dropdown-item d-flex align-items-center gap-2"
            onClick={() => {
              setContextMenu(null);
              onOpenBackup(contextMenu.backup.name);
            }}
          >
            <BoxArrowUpRight size={14} /> Open
          </button>
          <button
            type="button"
            className="dropdown-item d-flex align-items-center gap-2"
            onClick={() => {
              setContextMenu(null);
              handleDownload(contextMenu.backup.name);
            }}
          >
            <CloudArrowDownFill size={14} />
            {downloadingName === contextMenu.backup.name ? "Downloading…" : "Download"}
          </button>
          <button
            type="button"
            className="dropdown-item d-flex align-items-center gap-2"
            onClick={() => {
              setContextMenu(null);
              setConfirmingRestore(contextMenu.backup);
            }}
          >
            <ArrowCounterclockwise size={14} />
            {restoringName === contextMenu.backup.name ? "Restoring…" : "Restore"}
          </button>
          <div className="dropdown-divider" />
          <button
            type="button"
            className="dropdown-item d-flex align-items-center gap-2 text-danger"
            onClick={() => {
              setContextMenu(null);
              setConfirmingDelete(contextMenu.backup);
            }}
          >
            <TrashFill size={14} />
            {deletingName === contextMenu.backup.name ? "Deleting…" : "Delete"}
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}
