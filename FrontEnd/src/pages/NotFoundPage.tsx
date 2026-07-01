import { Link } from "react-router-dom";

import { Brand } from "@/components/ui/Brand";

export function NotFoundPage() {
  return (
    <div className="min-vh-100 d-flex flex-column align-items-center justify-content-center text-center px-3 gap-3">
      <Brand size="lg" />
      <div className="fw-display fw-bold" style={{ fontSize: "4rem", lineHeight: 1 }}>
        404
      </div>
      <h1 className="h4 fw-bold mb-0">This page wandered off</h1>
      <p className="text-muted-2" style={{ maxWidth: 380 }}>
        The page you're looking for doesn't exist or has moved. Let's get you back on track.
      </p>
      <Link to="/" className="btn btn-brand btn-lg">
        Back to dashboard
      </Link>
    </div>
  );
}
