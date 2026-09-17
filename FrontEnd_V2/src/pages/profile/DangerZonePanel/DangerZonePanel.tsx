import { useState } from "react";
import { ExclamationTriangleFill, PersonDashFill, PersonXFill } from "react-bootstrap-icons";

import { useToast } from "@/context/ToastContext";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { Panel } from "@/pages/profile/Panel/Panel";
import "@/pages/profile/DangerZonePanel/DangerZonePanel.scss";

export function DangerZonePanel() {
  const { info } = useToast();
  const [confirming, setConfirming] = useState<"deactivate" | "delete" | null>(null);

  function handleConfirm() {
    setConfirming(null);
    info("Account management isn't wired up yet — this will work once the backend supports it.");
  }

  return (
    <Panel
      icon={<ExclamationTriangleFill size={18} />}
      tone="danger"
      title="Danger Zone"
      desc="These actions affect your whole account. Proceed with care."
      className="panel-card--danger"
    >
      <div className="pf-danger-body">
        <div className="pf-danger-row">
          <div className="pf-danger-text">
            <span className="pf-danger-label"><PersonDashFill size={13} className="me-1" /> Deactivate account</span>
            <span className="pf-danger-hint">Temporarily hide your profile and pause reminders.</span>
          </div>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setConfirming("deactivate")}>
            Deactivate
          </button>
        </div>
        <div className="pf-danger-row">
          <div className="pf-danger-text">
            <span className="pf-danger-label"><PersonXFill size={13} className="me-1" /> Delete account</span>
            <span className="pf-danger-hint">Permanently erase your account and all data.</span>
          </div>
          <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setConfirming("delete")}>
            Delete
          </button>
        </div>
      </div>

      <ConfirmDialog
        show={confirming !== null}
        title={confirming === "delete" ? "Delete your account?" : "Deactivate your account?"}
        message={
          confirming === "delete"
            ? "This permanently deletes all your goals, habits, and history. This cannot be undone."
            : "Your profile will be hidden and reminders paused until you sign back in."
        }
        confirmLabel={confirming === "delete" ? "Delete" : "Deactivate"}
        destructive
        onConfirm={handleConfirm}
        onCancel={() => setConfirming(null)}
      />
    </Panel>
  );
}
