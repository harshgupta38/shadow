import { useEffect, useState } from "react";
import { Modal } from "react-bootstrap";
import { BoxArrowDown, CheckLg } from "react-bootstrap-icons";

import { api, ApiError } from "@/api";
import { useToast } from "@/context/ToastContext";

import "@/components/ui/ExportDataModal/ExportDataModal.scss";

interface ExportSection {
  key: string;
  label: string;
  description: string;
}

const SECTIONS: ExportSection[] = [
  {
    key: "goals",
    label: "Goals, Milestones & Tasks",
    description: "Your goals, milestones, and the tasks defined within them.",
  },
  {
    key: "habits",
    label: "Habits",
    description: "Your habit library and scheduling configuration.",
  },
  {
    key: "scheduled_tasks",
    label: "Scheduled Tasks",
    description: "All one-off scheduled tasks.",
  },
  {
    key: "chat_history",
    label: "Chat History",
    description: "All conversations and messages with Shadow agents.",
  },
  {
    key: "ai_memories",
    label: "AI Memories",
    description: "Things Shadow has learned and remembered about you.",
  },
  {
    key: "settings",
    label: "Settings",
    description: "Your planner, appearance, accessibility, and notification preferences.",
  },
];

interface ExportDataModalProps {
  show: boolean;
  userName: string;
  onHide: () => void;
}

export function ExportDataModal({ show, userName, onHide }: ExportDataModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(SECTIONS.map((s) => s.key)));
  const [exporting, setExporting] = useState(false);
  const { success, error } = useToast();

  useEffect(() => {
    if (show) setSelected(new Set(SECTIONS.map((s) => s.key)));
  }, [show]);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === SECTIONS.length ? new Set() : new Set(SECTIONS.map((s) => s.key)),
    );
  }

  async function handleExport() {
    if (selected.size === 0) return;
    setExporting(true);
    try {
      const blob = await api.settings.exportData([...selected]);
      const now = new Date();
      const pad = (n: number, len = 2) => String(n).padStart(len, "0");
      const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
      const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const safeName = userName.replace(/[^a-z0-9]/gi, "_");
      const filename = `${safeName}_${date}_${time}.json`;

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      success("Data exported successfully.");
      onHide();
    } catch (err) {
      error(err instanceof ApiError ? err.message : "Could not export data right now.");
    } finally {
      setExporting(false);
    }
  }

  const allSelected = selected.size === SECTIONS.length;
  const noneSelected = selected.size === 0;

  return (
    <Modal show={show} onHide={onHide} centered backdrop="static" className="export-data-modal">
      <Modal.Header closeButton className="edm-header">
        <div className="edm-title-block">
          <BoxArrowDown size={18} className="edm-icon" />
          <div>
            <h5 className="edm-title">Export my data</h5>
            <p className="edm-subtitle">Choose what to include in your export.</p>
          </div>
        </div>
      </Modal.Header>

      <Modal.Body className="edm-body">
        <button type="button" className="edm-select-all" onClick={toggleAll}>
          {allSelected ? "Deselect all" : "Select all"}
        </button>

        <ul className="edm-section-list">
          {SECTIONS.map((section) => {
            const checked = selected.has(section.key);
            return (
              <li key={section.key} className={`edm-section-item${checked ? " is-checked" : ""}`}>
                <button
                  type="button"
                  className="edm-section-btn"
                  onClick={() => toggle(section.key)}
                  aria-pressed={checked}
                >
                  <span className="edm-checkbox" aria-hidden="true">
                    {checked && <CheckLg size={11} />}
                  </span>
                  <span className="edm-section-text">
                    <span className="edm-section-label">{section.label}</span>
                    <span className="edm-section-desc">{section.description}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Modal.Body>

      <Modal.Footer className="edm-footer">
        <button type="button" className="btn btn-sm btn-ghost" onClick={onHide} disabled={exporting}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-sm btn-brand"
          onClick={() => void handleExport()}
          disabled={noneSelected || exporting}
        >
          {exporting ? (
            <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />
          ) : (
            <BoxArrowDown size={13} className="me-1" />
          )}
          {exporting ? "Exporting…" : `Export${selected.size > 0 ? ` (${selected.size})` : ""}`}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
