import { useState } from "react";
import { Modal } from "react-bootstrap";
import { Eye, EyeSlash, ShieldLockFill } from "react-bootstrap-icons";

import { api, ApiError } from "@/api";
import { useToast } from "@/context/ToastContext";
import { TextField } from "@/components/ui/TextField/TextField";
import { PasswordStrength } from "@/components/ui/PasswordStrength/PasswordStrength";

export interface ChangePasswordDialogProps {
  show: boolean;
  onCancel: () => void;
  onSaved: () => void;
}

export function ChangePasswordDialog({ show, onCancel, onSaved }: ChangePasswordDialogProps) {
  const { success, error: toastError } = useToast();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setCurrent("");
    setNext("");
    setConfirm("");
    setShowCurrent(false);
    setShowNext(false);
    setShowConfirm(false);
  }

  async function handleSave() {
    setSubmitting(true);
    try {
      await api.auth.changePassword(current, next);
      success("Password updated.");
      reset();
      onSaved();
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : "Couldn't update your password. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function eyeToggle(shown: boolean, onToggle: () => void, hasError?: boolean) {
    return (
      <button
        type="button"
        className={`btn btn-ghost btn-icon ${hasError ? "me-4" : ""}`}
        style={{ width: 34, height: 34 }}
        onClick={onToggle}
        aria-label={shown ? "Hide password" : "Show password"}
        tabIndex={-1}
      >
        {shown ? <EyeSlash size={16} /> : <Eye size={16} />}
      </button>
    );
  }

  const mismatch = confirm.length > 0 && next !== confirm;
  const canSave = current.trim().length > 0 && next.length >= 8 && next === confirm;

  return (
    <Modal
      show={show}
      onHide={() => { reset(); onCancel(); }}
      centered
      backdrop="static"
    >
      <Modal.Body className="p-4 pf-password-dialog">
        <div className="note-dialog-header mb-3">
          <div className="empty-icon" aria-hidden="true">
            <ShieldLockFill size={22} />
          </div>
          <div>
            <h2 className="h5 fw-bold mb-0">Change password</h2>
            <p className="text-muted-2 mb-0">Use a strong password you don't reuse anywhere else.</p>
          </div>
        </div>

        <TextField
          label="Current password"
          name="current-password"
          type={showCurrent ? "text" : "password"}
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          trailing={eyeToggle(showCurrent, () => setShowCurrent((v) => !v))}
        />
        <TextField
          label="New password"
          name="new-password"
          type={showNext ? "text" : "password"}
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          trailing={eyeToggle(showNext, () => setShowNext((v) => !v))}
        />
        <TextField
          label="Confirm new password"
          name="confirm-password"
          type={showConfirm ? "text" : "password"}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={mismatch ? "Passwords don't match." : null}
          trailing={eyeToggle(showConfirm, () => setShowConfirm((v) => !v), mismatch)}
        />
        <PasswordStrength password={next} />

        <div className="d-flex gap-2 justify-content-end mt-4">
          <button
            type="button"
            className="btn btn-outline-secondary"
            disabled={submitting}
            onClick={() => { reset(); onCancel(); }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-brand"
            disabled={!canSave || submitting}
            onClick={() => void handleSave()}
          >
            {submitting ? "Saving…" : "Save"}
          </button>
        </div>
      </Modal.Body>
    </Modal>
  );
}
