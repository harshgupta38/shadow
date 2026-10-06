import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeSlash, LockFill, ShieldLockFill } from "react-bootstrap-icons";

import { api } from "@/api";
import { ApiError } from "@/api/client";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { useToast } from "@/context/ToastContext";
import { TextField } from "@/components/ui/TextField/TextField";
import { PasswordStrength } from "@/components/ui/PasswordStrength/PasswordStrength";
import { ROUTES } from "@/routes/RoutePaths";

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

export function ResetPasswordPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { success } = useToast();

    const token = searchParams.get("token");
    const uid = Number(searchParams.get("uid"));
    const linkValid = Boolean(token) && Number.isInteger(uid);

    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
    const canSave = newPassword.length >= 8 && newPassword === confirmPassword;

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        if (!canSave || !token) return;
        setError(null);
        setSubmitting(true);
        try {
            await api.auth.resetPassword(uid, token, newPassword);
            success("Password reset. Please sign in with your new password.");
            navigate(ROUTES.LOGIN, { replace: true });
        } catch (err) {
            setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
        } finally {
            setSubmitting(false);
        }
    }

    if (!linkValid) {
        return (
            <AuthLayout
                mobileTitle="Invalid reset link"
                mobileSubtitle="This password reset link is missing or malformed."
            >
                <h1 className="h3 fw-bold mb-1 d-none d-md-block">Invalid reset link</h1>
                <p className="text-muted-2 mb-4">
                    This password reset link is invalid or incomplete. Request a new one from the sign-in page.
                </p>
                <Link to={ROUTES.FORGOT_PASSWORD} className="btn btn-brand btn-lg w-100">
                    Request a new link
                </Link>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout
            mobileTitle="Set a new password"
            mobileSubtitle="Choose a strong password for your account."
        >
            <h1 className="h3 fw-bold mb-1 d-none d-md-block">Set a new password</h1>
            <p className="text-muted-2 mb-4 d-none d-md-block">Choose a strong password for your account.</p>

            {error && (
                <div className="alert alert-danger py-2 px-3 small" role="alert">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
                <TextField
                    label="New password"
                    name="new-password"
                    type={showNew ? "text" : "password"}
                    autoComplete="new-password"
                    icon={<LockFill size={15} />}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    autoFocus
                    trailing={eyeToggle(showNew, () => setShowNew((v) => !v))}
                />
                <TextField
                    label="Confirm new password"
                    name="confirm-password"
                    type={showConfirm ? "text" : "password"}
                    autoComplete="new-password"
                    icon={<ShieldLockFill size={15} />}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    error={mismatch ? "Passwords don't match." : null}
                    required
                    trailing={eyeToggle(showConfirm, () => setShowConfirm((v) => !v), mismatch)}
                />
                <PasswordStrength password={newPassword} />

                <button
                    type="submit"
                    className="btn btn-brand btn-lg w-100 mt-3"
                    disabled={!canSave || submitting}
                >
                    {submitting ? "Resetting…" : "Reset password"}
                </button>
            </form>

            <p className="text-center text-muted-2 mt-4 mb-0">
                Remembered your password?{" "}
                <Link to={ROUTES.LOGIN} className="fw-semibold">
                    Sign in
                </Link>
            </p>
        </AuthLayout>
    );
}
