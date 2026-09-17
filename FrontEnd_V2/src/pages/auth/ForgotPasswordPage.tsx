import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { EnvelopeFill } from "react-bootstrap-icons";

import { api } from "@/api";
import { ApiError } from "@/api/client";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { TextField } from "@/components/ui/TextField/TextField";
import { ROUTES } from "@/routes/RoutePaths";

export function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        setError(null);
        setSubmitting(true);
        try {
            await api.auth.forgotPassword(email.trim());
            setSent(true);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
        } finally {
            setSubmitting(false);
        }
    }

    if (sent) {
        return (
            <AuthLayout
                mobileTitle="Check your email"
                mobileSubtitle="We've sent a password reset link if that address is registered."
            >
                <h1 className="h3 fw-bold mb-1 d-none d-md-block">Check your email</h1>
                <p className="text-muted-2 mb-4">
                    If an account exists for <strong>{email.trim()}</strong>, we've sent a link to reset your
                    password. It expires in 10 minutes.
                </p>
                <Link to={ROUTES.LOGIN} className="btn btn-outline-secondary btn-lg w-100">
                    Back to sign in
                </Link>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout
            mobileTitle="Forgot your password?"
            mobileSubtitle="Enter your email and we'll send you a link to reset it."
        >
            <h1 className="h3 fw-bold mb-1 d-none d-md-block">Forgot your password?</h1>
            <p className="text-muted-2 mb-4 d-none d-md-block">
                Enter your email and we'll send you a link to reset it.
            </p>

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
                    required
                    autoFocus
                />
                <button
                    type="submit"
                    className="btn btn-brand btn-lg w-100 mt-2"
                    disabled={submitting || !email.trim()}
                >
                    {submitting ? "Sending…" : "Send reset link"}
                </button>
            </form>

            <p className="text-center text-muted-2 mt-4 mb-0">
                Remembered it?{" "}
                <Link to={ROUTES.LOGIN} className="fw-semibold">
                    Sign in
                </Link>
            </p>
        </AuthLayout>
    );
}
