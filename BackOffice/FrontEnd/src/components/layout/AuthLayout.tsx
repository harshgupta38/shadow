import type { ReactNode } from "react";
import { Check2Circle } from "react-bootstrap-icons";
import { ThemeToggle } from "@/components/ui/ThemeToggle/ThemeToggle";
import { Brand } from "@/components/ui/Brand/Brand";

const FEATURES = ["Deployments", "Database control", "Server monitoring"];

interface AuthLayoutProps {
  children: ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="auth-page">
      {/* Top bar */}
      <header className="auth-topbar">
        <Brand size="md" />
        <ThemeToggle />
      </header>

      {/* Centered form */}
      <div className="auth-body">
        <div className="auth-form-wrap fade-in">
          {children}
        </div>
      </div>

      {/* Footer */}
      <footer className="auth-footer">
        <div className="auth-footer-features">
          {FEATURES.map((f) => (
            <span key={f}>
              <Check2Circle size={13} /> {f}
            </span>
          ))}
        </div>
        <p className="auth-footer-note mb-0">
          Shadow BackOffice · Internal tool · Restricted access
        </p>
      </footer>
    </div>
  );
}
