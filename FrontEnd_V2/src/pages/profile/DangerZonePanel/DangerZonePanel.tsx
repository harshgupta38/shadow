import { useState } from "react";
import { Eye, EyeSlash, ExclamationTriangleFill, PersonDashFill, PersonXFill } from "react-bootstrap-icons";

import { api, ApiError } from "@/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { TextField } from "@/components/ui/TextField/TextField";
import { Panel } from "@/pages/profile/Panel/Panel";
import "@/pages/profile/DangerZonePanel/DangerZonePanel.scss";

export function DangerZonePanel() {
  const { logout } = useAuth();
  const { success, error: toastError } = useToast();
  const [confirming, setConfirming] = useState<"deactivate" | "delete" | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function closeDialog() {
    setConfirming(null);
    setPassword("");
    setShowPassword(false);
  }

  async function handleConfirm() {
    const action = confirming;
    setSubmitting(true);
    try {
      if (action === "delete") {
        await api.auth.deleteAccount(password);
      } else {
        await api.auth.deactivateAccount(password);
      }
      success(action === "delete" ? "Account deleted." : "Account deactivated.");
      logout();
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
      closeDialog();
    }
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
        busy={submitting}
        confirmDisabled={password.trim().length === 0}
        onConfirm={() => void handleConfirm()}
        onCancel={closeDialog}
      >
        <TextField
          label="Confirm your password"
          name="danger-zone-password"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          trailing={
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              style={{ width: 34, height: 34 }}
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              tabIndex={-1}
            >
              {showPassword ? <EyeSlash size={16} /> : <Eye size={16} />}
            </button>
          }
        />
      </ConfirmDialog>
    </Panel>
  );
}
