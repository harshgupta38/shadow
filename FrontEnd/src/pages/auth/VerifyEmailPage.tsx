import { useEffect, useState } from "react";
import { CheckCircleFill, EnvelopeFill, ExclamationTriangleFill } from "react-bootstrap-icons";
import { Link, useSearchParams } from "react-router-dom";

import { api, ApiError } from "@/api";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { LoadingState } from "@/components/ui/LoadingState";
import { useAuth } from "@/context/AuthContext";

type VerifyState = "loading" | "success" | "error";

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();
  const [state, setState] = useState<VerifyState>("loading");
  const [message, setMessage] = useState("Verifying your email now...");

  useEffect(() => {
    let active = true;
    const token = (searchParams.get("token") ?? "").trim();

    async function run() {
      if (!token) {
        setState("error");
        setMessage("This verification link is invalid or incomplete.");
        return;
      }

      setState("loading");
      setMessage("Verifying your email now...");

      try {
        const result = await api.auth.verifyEmail(token);
        if (!active) return;
        setState("success");
        setMessage(result.detail || "Your email has been verified.");
      } catch (err) {
        if (!active) return;
        setState("error");
        setMessage(
          err instanceof ApiError
            ? err.message
            : "Could not verify your email. Please request a new verification link.",
        );
      }
    }

    void run();

    return () => {
      active = false;
    };
  }, [searchParams]);

  return (
    <AuthLayout>
      <div className="d-flex flex-column gap-3">
        <div className="d-flex align-items-center gap-2">
          <EnvelopeFill size={18} />
          <span className="fw-semibold text-uppercase" style={{ letterSpacing: "0.04em" }}>
            Email Verification
          </span>
        </div>

        <h1 className="h3 fw-bold mb-0">Confirming your email</h1>

        {state === "loading" && <LoadingState label={message} full={false} />}

        {state === "success" && (
          <div className="surface-2 p-3">
            <div className="d-flex align-items-start gap-2 mb-2 text-success">
              <CheckCircleFill size={18} style={{ marginTop: 2 }} />
              <div className="fw-semibold">Email verified</div>
            </div>
            <p className="text-muted-2 mb-3">{message}</p>
            <Link to={isAuthenticated ? "/" : "/login"} className="btn btn-brand">
              {isAuthenticated ? "Go to dashboard" : "Go to login"}
            </Link>
          </div>
        )}

        {state === "error" && (
          <div className="surface-2 p-3">
            <div className="d-flex align-items-start gap-2 mb-2 text-danger">
              <ExclamationTriangleFill size={18} style={{ marginTop: 2 }} />
              <div className="fw-semibold">Verification failed</div>
            </div>
            <p className="text-muted-2 mb-3">{message}</p>
            <div className="d-flex gap-2 flex-wrap">
              <Link to={isAuthenticated ? "/profile" : "/login"} className="btn btn-soft">
                {isAuthenticated ? "Request new link" : "Sign in to request a new link"}
              </Link>
              <Link to={isAuthenticated ? "/" : "/login"} className="btn btn-outline-secondary">
                {isAuthenticated ? "Go to dashboard" : "Go to login"}
              </Link>
            </div>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
