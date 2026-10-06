import { useState, useEffect, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { EnvelopeFill, Eye, EyeSlash, LockFill, PersonFill } from "react-bootstrap-icons";

import { ApiError } from "@/api/client";
import { type RegisterRequest } from "@/api";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { TextField } from "@/components/ui/TextField/TextField";
import { PasswordStrength } from "@/components/ui/PasswordStrength/PasswordStrength";
import { useAuth } from "@/context/AuthContext";
import { ROUTES } from "@/routes/RoutePaths";
import { TIMING } from "@/constant/tuning";

function fmtCountdown(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
}

export function RegisterPage() {
    const { register } = useAuth();
    const navigate = useNavigate();

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);

    // Rate-limit lockout: timestamp (ms) when the lockout expires, null when unlocked
    const [lockedUntil, setLockedUntil] = useState<number | null>(null);
    const [countdown, setCountdown] = useState(0);

    useEffect(() => {
        if (lockedUntil === null) return;

        const tick = () => {
            const remaining = Math.ceil((lockedUntil - Date.now()) / 1000);
            if (remaining <= 0) {
                setLockedUntil(null);
                setCountdown(0);
                setError(null);
            } else {
                setCountdown(remaining);
            }
        };

        tick();
        const id = setInterval(tick, TIMING.LOCKOUT_COUNTDOWN_TICK_MS);
        return () => clearInterval(id);
    }, [lockedUntil]);

    const isLocked = lockedUntil !== null;

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        if (isLocked) return;
        setError(null);
        setFieldErrors({});
        setSubmitting(true);

        const payload: RegisterRequest = {
            name: name.trim(),
            email: email.trim(),
            password
        };

        try {
            await register(payload);
            navigate(ROUTES.DASHBOARD, { replace: true });
        } catch (err) {
            if (err instanceof ApiError) {
                setError(err.message);
                if (err.fieldErrors) setFieldErrors(err.fieldErrors);
                if (err.status === 429 && err.retryAfter && err.retryAfter > 0) {
                    setLockedUntil(Date.now() + err.retryAfter * 1000);
                }
            } else {
                setError("Unable to create your account. Please try again.");
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
            mobileTitle={<>Create your <span className="auth-aside-title-accent">account</span> ✨</>}
            mobileSubtitle="Turn your goals into daily momentum."
        >
            <h1 className="h3 fw-bold mb-1 d-none d-md-block">Create your account</h1>
            <p className="text-muted-2 mb-4 d-none d-md-block">Start turning your goals into daily momentum.</p>

            {error && (
                <div className="alert alert-danger py-2 px-3 small" role="alert">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
                <TextField
                    label="Name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    placeholder="Your name"
                    icon={<PersonFill size={15} />}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onClearError={() => clearFieldError("name")}
                    error={fieldErrors.name}
                    required
                    autoFocus
                />
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
                />
                <TextField
                    label="Password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Create a strong password"
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
                <PasswordStrength password={password} />

                <button
                    type="submit"
                    className="btn btn-brand btn-lg w-100 mt-2"
                    disabled={submitting || isLocked}
                >
                    {isLocked
                        ? `Locked · ${fmtCountdown(countdown)}`
                        : submitting
                            ? "Creating account…"
                            : "Create account"}
                </button>
            </form>

            <p className="text-center text-muted-2 mt-4 mb-0">
                Already have an account?{" "}
                <Link to={ROUTES.LOGIN} className="fw-semibold">
                    Sign in
                </Link>
            </p>
        </AuthLayout>
    );
}
