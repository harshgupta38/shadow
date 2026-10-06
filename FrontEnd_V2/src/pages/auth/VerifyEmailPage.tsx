import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ExclamationTriangleFill, PatchCheckFill } from "react-bootstrap-icons";

import { api } from "@/api";
import { ApiError } from "@/api/client";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { ROUTES } from "@/routes/RoutePaths";

type Status = "verifying" | "success" | "error";

function StatusIcon({ tone, children }: { tone: "success" | "danger"; children: React.ReactNode }) {
    return (
        <div
            className="mx-auto mb-3 d-flex align-items-center justify-content-center rounded-circle"
            style={{
                width: 64,
                height: 64,
                background: `var(--jv-${tone}-soft)`,
                color: `var(--jv-${tone})`,
            }}
            aria-hidden="true"
        >
            {children}
        </div>
    );
}

export function VerifyEmailPage() {
    const [searchParams] = useSearchParams();
    const [status, setStatus] = useState<Status>("verifying");
    const [error, setError] = useState<string | null>(null);
    const attempted = useRef(false);

    const token = searchParams.get("token");
    const uid = Number(searchParams.get("uid"));
    const linkValid = Boolean(token) && Number.isInteger(uid);

    useEffect(() => {
        if (!linkValid || !token || attempted.current) return;
        attempted.current = true;

        (async () => {
            try {
                await api.auth.verifyEmail(uid, token);
                setStatus("success");
            } catch (err) {
                setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
                setStatus("error");
            }
        })();
    }, [linkValid, uid, token]);

    if (!linkValid) {
        return (
            <AuthLayout
                mobileTitle="Invalid verification link"
                mobileSubtitle="This link is missing or malformed."
            >
                <StatusIcon tone="danger">
                    <ExclamationTriangleFill size={28} />
                </StatusIcon>
                <h1 className="h3 fw-bold mb-1 text-center">Invalid verification link</h1>
                <p className="text-muted-2 mb-4 text-center">
                    This link is missing or malformed. Sign in and resend the verification email from your
                    profile page instead.
                </p>
                <Link to={ROUTES.LOGIN} className="btn btn-brand btn-lg w-100">
                    Back to sign in
                </Link>
            </AuthLayout>
        );
    }

    if (status === "verifying") {
        return (
            <AuthLayout mobileTitle="Verifying your email" mobileSubtitle="One moment…">
                <div className="text-center py-4">
                    <span className="spinner-border text-brand mb-3" role="status" aria-label="Verifying" />
                    <h1 className="h4 fw-bold mb-0">Verifying your email…</h1>
                </div>
            </AuthLayout>
        );
    }

    if (status === "error") {
        return (
            <AuthLayout
                mobileTitle="Verification failed"
                mobileSubtitle="This link is invalid or has already been used."
            >
                <StatusIcon tone="danger">
                    <ExclamationTriangleFill size={28} />
                </StatusIcon>
                <h1 className="h3 fw-bold mb-1 text-center">Verification failed</h1>
                <p className="text-muted-2 mb-4 text-center">
                    {error ?? "This verification link is invalid or has expired."} Sign in and resend the
                    verification email from your profile page.
                </p>
                <Link to={ROUTES.LOGIN} className="btn btn-brand btn-lg w-100">
                    Back to sign in
                </Link>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout
            mobileTitle="Email verified"
            mobileSubtitle="Your email address has been confirmed."
        >
            <StatusIcon tone="success">
                <PatchCheckFill size={28} />
            </StatusIcon>
            <h1 className="h3 fw-bold mb-1 text-center">Email verified!</h1>
            <p className="text-muted-2 mb-4 text-center">
                Your email address has been confirmed. You're all set.
            </p>
            <Link to={ROUTES.DASHBOARD} className="btn btn-brand btn-lg w-100">
                Continue to Shadow
            </Link>
        </AuthLayout>
    );
}
