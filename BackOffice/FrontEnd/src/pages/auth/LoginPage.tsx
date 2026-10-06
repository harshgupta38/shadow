import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { EnvelopeFill, LockFill, Eye, EyeSlash } from "react-bootstrap-icons";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { TextField } from "@/components/ui/TextField/TextField";
import { ApiError } from "@/api";
import { useAuth } from "@/context/AuthContext";
import { ROUTES } from "@/routes/RoutePaths";

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  function clearFieldError(field: string) {
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[field];
      const remaining = Object.values(next);
      setError(remaining.length > 0 ? remaining[0] : null);
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setSubmitting(true);

    try {
      await login({ email: email.trim(), password });
      navigate(ROUTES.HOME, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        if (err.fieldErrors) setFieldErrors(err.fieldErrors);
      } else {
        setError("Unable to sign in. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <h1 className="auth-form-heading">Welcome back</h1>
      <p className="auth-form-sub">Sign in to pick up where you left off.</p>

      {error && (
        <div className="alert alert-danger py-2 px-3 small mb-3" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          icon={<EnvelopeFill size={15} />}
          value={email}
          error={fieldErrors["email"]}
          onChange={(e) => setEmail(e.target.value)}
          onClearError={() => clearFieldError("email")}
          required
          autoFocus
        />

        <TextField
          label="Password"
          name="password"
          className="mb-4"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          placeholder="Your password"
          icon={<LockFill size={15} />}
          value={password}
          error={fieldErrors["password"]}
          onChange={(e) => setPassword(e.target.value)}
          onClearError={() => clearFieldError("password")}
          required
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

        <button
          type="submit"
          className="btn btn-brand btn-lg w-100 d-flex align-items-center justify-content-center gap-2"
          disabled={submitting}
        >
          {submitting && (
            <span
              className="spinner-border spinner-border-sm"
              role="status"
              aria-hidden="true"
            />
          )}
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthLayout>
  );
}
