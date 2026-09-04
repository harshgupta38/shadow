import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Calendar3, EnvelopeFill, Eye, EyeSlash, LockFill, Stars } from "react-bootstrap-icons";

import { ApiError } from "@/api";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { TextField } from "@/components/ui/TextField";
import { useAuth } from "@/context/AuthContext";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname?: string } })?.from?.pathname ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
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
      <div className="login-mobile-hero d-md-none">
        <div className="login-mobile-hero-badge" aria-hidden="true">
          <span className="login-hero-spark s1">
            <Stars size={13} />
          </span>
          <span className="login-hero-spark s2">
            <Stars size={17} />
          </span>
          <span className="login-hero-spark s3">
            <Stars size={11} />
          </span>
          <div className="login-mobile-hero-icon">👋</div>
        </div>
        <h1 className="login-mobile-title">
          Welcome back <span aria-hidden="true">👋</span>
        </h1>
        <p className="login-mobile-subtitle">Sign in to continue your journey.</p>
      </div>

      <h1 className="h3 fw-bold mb-1 d-none d-md-block">Welcome back</h1>
      <p className="text-muted-2 mb-4 d-none d-md-block">Sign in to pick up where you left off.</p>

      {error && (
        <div className="alert alert-danger py-2 px-3 small" role="alert">
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
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
          required
          autoFocus
        />
        <TextField
          label="Password"
          name="password"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          placeholder="Your password"
          icon={<LockFill size={15} />}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          required
          trailing={
            <button
              type="button"
              className={`btn btn-ghost btn-icon ${fieldErrors.password ? "me-4" : ""}`}
              style={{ width: 34, height: 34 }}
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              tabIndex={-1}
            >
              {showPassword ? <EyeSlash size={16} /> : <Eye size={16} />}
            </button>
          }
        />

        <div className="text-end d-md-none mb-2">
          <a href="#" className="small fw-semibold">
            Forgot password?
          </a>
        </div>

        <button
          type="submit"
          className="btn btn-brand btn-lg w-100 mt-2"
          disabled={submitting}
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>

        <div className="login-mobile-alt d-md-none">
          <div className="auth-or-divider">
            <span>or</span>
          </div>
          <Link to="/register" className="btn login-mobile-create w-100 fw-semibold">
            Create an account
          </Link>

          <div className="login-mobile-pill-grid">
            <div className="login-mobile-pill">
              <span className="login-mobile-pill-icon">
                <Stars size={18} />
              </span>
              <span>AI Powered</span>
            </div>
            <div className="login-mobile-pill">
              <span className="login-mobile-pill-icon">
                <LockFill size={18} />
              </span>
              <span>Private &amp; Secure</span>
            </div>
            <div className="login-mobile-pill">
              <span className="login-mobile-pill-icon">
                <Calendar3 size={18} />
              </span>
              <span>Daily Planning</span>
            </div>
          </div>

          <p className="text-muted-2 text-center small mb-0">
            Your data stays yours. Made with <span className="login-mobile-heart">❤️</span> by Harsh
          </p>
        </div>
      </form>

      <p className="text-center text-muted-2 mt-4 mb-0 d-none d-md-block">
        New to Shadow?{" "}
        <Link to="/register" className="fw-semibold">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}
