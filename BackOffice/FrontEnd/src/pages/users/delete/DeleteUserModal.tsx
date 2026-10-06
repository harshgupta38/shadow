import { useState } from "react";
import { Modal } from "react-bootstrap";
import { ExclamationTriangleFill } from "react-bootstrap-icons";
import { api, ApiError } from "@/api";
import type { AppUser } from "@/api";

interface DeleteUserModalProps {
  user: AppUser;
  onClose: () => void;
  onDeleted: (userId: number) => void;
}

// Deleting a Shadow user is never a plain row delete — the backend archives
// every table their data touches (goals, tasks, habits, conversations, …)
// into deleted_data.db before removing any of it from the live database
// (see BackOffice/BackEnd/app/services/deleted_data_service.py). The typed
// email is this modal's only real safeguard against deleting the wrong
// account, so the button stays disabled until it matches exactly.
export function DeleteUserModal({ user, onClose, onDeleted }: DeleteUserModalProps) {
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = confirmText.trim().toLowerCase() === user.email.trim().toLowerCase();

  async function handleConfirm() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.users.deleteShadow(user.id, confirmText.trim());
      onDeleted(user.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete this user. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <Modal show onHide={() => !submitting && onClose()} centered className="deploy-modal">
      <Modal.Header>
        <h5 className="deploy-modal-title d-flex align-items-center gap-2">
          <ExclamationTriangleFill size={16} className="text-danger" />
          Delete user
        </h5>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          onClick={onClose}
          disabled={submitting}
          aria-label="Close"
        >
          ×
        </button>
      </Modal.Header>
      <Modal.Body>
        {error && (
          <div className="alert alert-danger py-2 px-3 small mb-3" role="alert">{error}</div>
        )}
        <p className="mb-2">
          This permanently removes <strong>{user.name}</strong> (<strong>{user.email}</strong>) and every goal,
          task, habit, conversation, and other row tied to their account from the live database.
        </p>
        <p className="mb-3">
          Nothing is lost for good — a safety backup is taken first, and all of their data is archived to the
          "Deleted Data" tab on the Database page in case it's ever needed again. But the account itself, and its
          place in the live database, is gone.
        </p>
        <label htmlFor="delete-user-confirm-email" className="form-label">
          Type <strong>{user.email}</strong> to confirm
        </label>
        <input
          id="delete-user-confirm-email"
          className="form-control"
          type="text"
          autoComplete="off"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          disabled={submitting}
          autoFocus
        />
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitting}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-danger d-flex align-items-center gap-2"
          onClick={handleConfirm}
          disabled={!canSubmit || submitting}
        >
          {submitting && <span className="spinner-border spinner-border-sm" />}
          {submitting ? "Deleting…" : "Delete user"}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
