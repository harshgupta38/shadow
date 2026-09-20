import { useState } from "react";
import { Modal } from "react-bootstrap";
import { Eye, EyeSlash } from "react-bootstrap-icons";
import { api, ApiError } from "@/api";
import type { AppUser } from "@/api";
import { TextField } from "@/components/ui/TextField/TextField";

interface AddUserDialogProps {
  onClose: () => void;
  onCreated: (user: AppUser) => void;
}

const EMPTY_FIELD_ERRORS: Record<string, string> = {};

export function AddUserDialog({ onClose, onCreated }: AddUserDialogProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [secretKey, setSecretKey] = useState("");

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);

  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState(EMPTY_FIELD_ERRORS);
  const [submitting, setSubmitting] = useState(false);

  function clearFieldError(field: string) {
    setFieldErrors((current) => {
      if (!(field in current)) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  const canSubmit =
    currentPassword.length > 0 &&
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length >= 8 &&
    secretKey.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;

    setFormError(null);
    setSubmitting(true);
    try {
      const created = await api.users.createBackofficeAdmin({
        current_password: currentPassword,
        name: name.trim(),
        email: email.trim(),
        password,
        secret_key: secretKey,
      });
      onCreated(created);
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
        setFieldErrors(err.fieldErrors ?? EMPTY_FIELD_ERRORS);
      } else {
        setFormError("Could not create the account. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  // hasError shifts the button clear of the native Bootstrap invalid-icon,
  // which otherwise renders under it and overlaps (see ChangePasswordDialog).
  function eyeToggle(shown: boolean, onToggle: () => void, hasError?: boolean) {
    return (
      <button
        type="button"
        className={`btn btn-ghost btn-icon${hasError ? " me-4" : ""}`}
        style={{ width: 34, height: 34 }}
        onClick={onToggle}
        aria-label={shown ? "Hide password" : "Show password"}
        tabIndex={-1}
      >
        {shown ? <EyeSlash size={16} /> : <Eye size={16} />}
      </button>
    );
  }

  return (
    <Modal show onHide={() => !submitting && onClose()} centered className="deploy-modal">
      <Modal.Header>
        <h5 className="deploy-modal-title">Add BackOffice user</h5>
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
      <form onSubmit={handleSubmit} noValidate>
        <Modal.Body>
          {formError && (
            <div className="alert alert-danger py-2 px-3 small mb-3" role="alert">{formError}</div>
          )}

          <TextField
            label="Your password"
            name="current_password"
            type={showCurrentPassword ? "text" : "password"}
            autoComplete="current-password"
            hint="Confirms it's really you."
            value={currentPassword}
            error={fieldErrors["current_password"]}
            onChange={(e) => setCurrentPassword(e.target.value)}
            onClearError={() => clearFieldError("current_password")}
            trailing={eyeToggle(showCurrentPassword, () => setShowCurrentPassword((v) => !v), !!fieldErrors["current_password"])}
            required
            autoFocus
          />

          <TextField
            label="Name"
            name="name"
            type="text"
            autoComplete="name"
            value={name}
            error={fieldErrors["name"]}
            onChange={(e) => setName(e.target.value)}
            onClearError={() => clearFieldError("name")}
            required
          />

          <TextField
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            error={fieldErrors["email"]}
            onChange={(e) => setEmail(e.target.value)}
            onClearError={() => clearFieldError("email")}
            required
          />

          <TextField
            label="Password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            hint="At least 8 characters."
            value={password}
            error={fieldErrors["password"]}
            onChange={(e) => setPassword(e.target.value)}
            onClearError={() => clearFieldError("password")}
            trailing={eyeToggle(showPassword, () => setShowPassword((v) => !v), !!fieldErrors["password"])}
            required
          />

          <TextField
            label="Secret key"
            name="secret_key"
            className="mb-0"
            type={showSecretKey ? "text" : "password"}
            autoComplete="off"
            hint="A secret key, only known to Site Owner."
            value={secretKey}
            error={fieldErrors["secret_key"]}
            onChange={(e) => setSecretKey(e.target.value)}
            onClearError={() => clearFieldError("secret_key")}
            trailing={eyeToggle(showSecretKey, () => setShowSecretKey((v) => !v), !!fieldErrors["secret_key"])}
            required
          />
        </Modal.Body>
        <Modal.Footer>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="btn btn-brand d-flex align-items-center gap-2" disabled={!canSubmit || submitting}>
            {submitting && <span className="spinner-border spinner-border-sm" />}
            {submitting ? "Creating…" : "Create account"}
          </button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
