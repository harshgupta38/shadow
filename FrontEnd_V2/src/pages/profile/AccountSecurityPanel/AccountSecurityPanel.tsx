import { useEffect, useState, type ReactNode } from "react";
import { ExclamationTriangleFill, PatchCheckFill, ShieldLockFill } from "react-bootstrap-icons";

import { useToast } from "@/context/ToastContext";
import { TIMING } from "@/constant/tuning";
import { Panel } from "@/pages/profile/Panel/Panel";
import { ChangePasswordDialog } from "@/pages/profile/ChangePasswordDialog/ChangePasswordDialog";
import "@/pages/profile/AccountSecurityPanel/AccountSecurityPanel.scss";

const RESEND_VERIFICATION_COOLDOWN_SECONDS = 30;

export interface AccountSecurityPanelProps {
  displayName: string;
  email: string;
  emailVerified: boolean;
  onEditName: () => void;
}

function ProfileFieldRow({ label, value, action }: { label: string; value: ReactNode; action?: ReactNode }) {
  return (
    <div className="pf-field-row">
      <div className="pf-field-row-text">
        <span className="pf-field-label">{label}</span>
        <span className="pf-field-value">{value}</span>
      </div>
      {action}
    </div>
  );
}

export function AccountSecurityPanel({ displayName, email, emailVerified, onEditName }: AccountSecurityPanelProps) {
  const { success } = useToast();

  const [changingPassword, setChangingPassword] = useState(false);
  const [resendLockedUntil, setResendLockedUntil] = useState<number | null>(null);
  const [resendCountdown, setResendCountdown] = useState(0);

  useEffect(() => {
    if (resendLockedUntil === null) return;

    const tick = () => {
      const remaining = Math.ceil((resendLockedUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        setResendLockedUntil(null);
        setResendCountdown(0);
      } else {
        setResendCountdown(remaining);
      }
    };

    tick();
    const id = setInterval(tick, TIMING.LOCKOUT_COUNTDOWN_TICK_MS);
    return () => clearInterval(id);
  }, [resendLockedUntil]);

  function handleResendVerification() {
    success("Verification email sent.");
    setResendLockedUntil(Date.now() + RESEND_VERIFICATION_COOLDOWN_SECONDS * 1000);
  }

  function handlePasswordSaved() {
    setChangingPassword(false);
    success("Password updated.");
  }

  return (
    <Panel
      icon={<ShieldLockFill size={18} />}
      tone="info"
      title="Account & Security"
      desc="Your core account details. Manage devices and privacy in Settings."
    >
      <div className="pf-panel-body">
        <ProfileFieldRow
          label="Full name"
          value={displayName}
          action={
            <button type="button" className="pf-text-cta" onClick={onEditName}>
              Edit
            </button>
          }
        />
        <ProfileFieldRow
          label="Email address"
          value={
            <span className="d-inline-flex flex-wrap align-items-center gap-2">
              {email}
              {emailVerified ? (
                <span className="pill pill-success pf-verified-pill">
                  <PatchCheckFill size={11} /> Verified
                </span>
              ) : (
                <span className="pill pill-danger pf-verified-pill">
                  <ExclamationTriangleFill size={11} /> Not verified
                </span>
              )}
            </span>
          }
          action={!emailVerified && (
            <button
              type="button"
              className="pf-text-cta"
              disabled={resendLockedUntil !== null}
              onClick={handleResendVerification}
            >
              {resendLockedUntil !== null ? `Resent · ${resendCountdown}s` : "Resend email"}
            </button>
          )}
        />
        <ProfileFieldRow
          label="Password"
          value="••••••••••••"
          action={
            <button type="button" className="pf-text-cta" onClick={() => setChangingPassword(true)}>
              Change
            </button>
          }
        />
      </div>

      <ChangePasswordDialog
        show={changingPassword}
        onCancel={() => setChangingPassword(false)}
        onSaved={handlePasswordSaved}
      />
    </Panel>
  );
}
