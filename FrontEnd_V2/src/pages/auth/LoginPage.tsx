import { useState, type FormEvent } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { EnvelopeFill, Eye, EyeSlash, LockFill } from "react-bootstrap-icons";

import { ApiError } from "@/api/client";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { useAuth } from "@/context/AuthContext";
import { TextField } from "@/components/ui/TextField/TextField";
import { ROUTES } from "@/routes/RoutePaths";

export function LoginPage() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const from = location.state?.from?.pathname ?? ROUTES.DASHBOARD;

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
            await login({ email: email.trim(), password });
            navigate(from, { replace: true });
        } catch (error) {
            if (error instanceof ApiError) {
                setError(error.message);
                if (error.fieldErrors)
                    setFieldErrors(error.fieldErrors);
            } else {
                setError("Unable to sign in. Please try again.");
            }
        } finally {
            setSubmitting(false);
        }
    }

    function clearFieldError(field: keyof typeof fieldErrors) {
        setFieldErrors((current) => {
            if (!current[field])
                return current;

            const next = { ...current };
            delete next[field];

            const remainingErrors = Object.values(next);
            setError(remainingErrors.length > 0 ? remainingErrors[0] : null);

            return next;
        });
    }

    return (
        <AuthLayout
            mobileTitle={<>Welcome <span className="auth-aside-title-accent">back</span> 👋</>}
            mobileSubtitle="Sign in to pick up where you left off."
        >
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
                    onClearError={() => clearFieldError("email")}
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
                    onClearError={() => clearFieldError("password")}
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
            </form>

            <p className="text-center text-muted-2 mt-3 mb-0 d-md-none">
                New to Shadow?{" "}
                <Link to={ROUTES.REGISTER} className="fw-semibold">
                    Create an account
                </Link>
            </p>

            <p className="text-center text-muted-2 mt-4 mb-0 d-none d-md-block">
                New to Shadow?{" "}
                <Link to={ROUTES.REGISTER} className="fw-semibold">
                    Create an account
                </Link>
            </p>
        </AuthLayout>
    );
}