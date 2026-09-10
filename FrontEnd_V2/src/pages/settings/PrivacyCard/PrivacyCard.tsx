import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BoxArrowDown, ShieldFill, Trash3Fill } from "react-bootstrap-icons";
import { api, ApiError } from "@/api";
import type { PrivacySettings } from "@/api/settings";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { useToast } from "@/context/ToastContext";
import { Card, ToggleRow } from "@/pages/settings/SettingsShared";
import "@/pages/settings/PrivacyCard/PrivacyCard.scss";

export function PrivacyCard({
  data,
  isDirty,
  onUpdate,
}: {
  data: PrivacySettings;
  isDirty: boolean;
  onUpdate: (d: PrivacySettings) => void;
}) {
  const navigate = useNavigate();
  const { success, error } = useToast();
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [exportingData, setExportingData] = useState(false);
  const [memoryCount, setMemoryCount] = useState<number | null>(null);

  useEffect(() => {
    if (!data.ai_memory_enabled) return;
    // TODO: replace with real API call
    setMemoryCount(18);
  }, [data.ai_memory_enabled]);

  function set<K extends keyof PrivacySettings>(key: K, value: PrivacySettings[K]) {
    onUpdate({ ...data, [key]: value });
  }

  async function handleExport() {
    setExportingData(true);
    try {
      const blob = await api.settings.exportData();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `shadow-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      success("Data export downloaded.");
    } catch (err) {
      error(err instanceof ApiError ? err.message : "Could not export data right now.");
    } finally {
      setExportingData(false);
    }
  }

  async function handleClearHistory() {
    setClearingHistory(true);
    try {
      await api.settings.clearChatHistory();
      setShowClearConfirm(false);
      success("Chat history cleared.");
    } catch (err) {
      error(err instanceof ApiError ? err.message : "Could not clear history right now.");
    } finally {
      setClearingHistory(false);
    }
  }

  return (
    <>
      <Card
        className="privacy-card"
        icon={<ShieldFill size={16} />}
        title="Privacy & Data"
        desc="Control what Shadow collects and how your data is used."
        isDirty={isDirty}
      >
        <div className="st-memory-block">
          <ToggleRow
            label="AI memory"
            description="Allow Shadow to remember useful information across conversations."
            checked={data.ai_memory_enabled}
            onChange={(v) => set("ai_memory_enabled", v)}
          />
          {data.ai_memory_enabled && memoryCount !== null && (
            <div className="st-memory-usage">
              <div className="st-memory-usage-top">
                <span className="st-memory-usage-label">Memory usage</span>
                <button
                  type="button"
                  className="st-memory-link"
                  onClick={() => navigate("/memories")}
                >
                  View memories →
                </button>
              </div>
              <span className="st-memory-usage-value">
                Shadow currently remembers <strong>{memoryCount}</strong> things
              </span>
            </div>
          )}
        </div>

        <div className="st-toggle-group">
          <span className="st-group-label">Your data</span>
          <div className="st-action-row pt-0">
            <div>
              <p className="st-action-label">Export my data</p>
              <p className="st-action-desc">
                Download a JSON file with all your goals, tasks, habits, and history.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm st-action-btn"
              onClick={() => void handleExport()}
              disabled={exportingData}
            >
              {exportingData ? (
                <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
              ) : (
                <BoxArrowDown size={14} />
              )}
              {exportingData ? "Exporting…" : "Export"}
            </button>
          </div>

          <div className="st-action-row st-action-row--danger pb-0">
            <div>
              <p className="st-action-label">Clear chat history</p>
              <p className="st-action-desc">
                Permanently delete all conversations with Shadow.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-sm st-action-btn st-action-btn--danger"
              onClick={() => setShowClearConfirm(true)}
              disabled={clearingHistory}
            >
              <Trash3Fill size={13} />
              Clear
            </button>
          </div>
        </div>
      </Card>

      <ConfirmDialog
        show={showClearConfirm}
        title="Clear chat history?"
        message="All your conversations with Shadow will be permanently deleted. This action cannot be undone."
        confirmLabel="Clear history"
        cancelLabel="Cancel"
        destructive
        busy={clearingHistory}
        onConfirm={() => void handleClearHistory()}
        onCancel={() => setShowClearConfirm(false)}
      />
    </>
  );
}
