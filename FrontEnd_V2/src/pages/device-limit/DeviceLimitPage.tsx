import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    Display,
    LaptopFill,
    PhoneFill,
    ShieldLockFill,
    TabletFill,
    TrashFill,
} from "react-bootstrap-icons";

import { api, ApiError } from "@/api";
import type { SessionInfo, SessionsListResponse } from "@/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { ThemeToggle } from "@/components/ui/ThemeToggle/ThemeToggle";
import { ROUTES } from "@/routes/RoutePaths";
import "@/pages/device-limit/DeviceLimitPage.scss";

function DeviceIcon({ deviceName }: { deviceName: string }) {
    const lower = deviceName.toLowerCase();
    if (lower.includes("iphone") || lower.includes("android phone"))
        return <PhoneFill size={20} />;
    if (lower.includes("ipad") || lower.includes("tablet"))
        return <TabletFill size={20} />;
    if (lower.includes("mac") || lower.includes("laptop"))
        return <LaptopFill size={20} />;
    if (lower.includes("pc") || lower.includes("windows") || lower.includes("linux"))
        return <Display size={20} />;
    return <PhoneFill size={20} />;
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function DeviceLimitPage() {
    const navigate = useNavigate();
    const { clearSessionLimit, logout } = useAuth();
    const { error: toastError } = useToast();

    const [data, setData] = useState<SessionsListResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [revoking, setRevoking] = useState<number | null>(null);
    const [pendingRevoke, setPendingRevoke] = useState<SessionInfo | null>(null);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            const resp = await api.auth.getSessions();
            setData(resp);
        } catch (err) {
            toastError(err instanceof ApiError ? err.message : "Could not load sessions.");
        } finally {
            setLoading(false);
        }
    }, [toastError]);

    useEffect(() => {
        load();
    }, [load]);

    // When sessions drop to within limit, allow navigation
    useEffect(() => {
        if (!data) return;
        if (!data.session_limit_exceeded) {
            clearSessionLimit();
            navigate(ROUTES.DASHBOARD, { replace: true });
        }
    }, [data, clearSessionLimit, navigate]);

    async function handleRevoke(session: SessionInfo) {
        if (session.is_current) {
            // Revoking own session = logout
            logout();
            return;
        }
        setRevoking(session.id);
        try {
            await api.auth.revokeSession(session.id);
            await load();
        } catch (err) {
            toastError(err instanceof ApiError ? err.message : "Could not remove device.");
        } finally {
            setRevoking(null);
        }
    }

    const slots = data?.max_concurrent_devices ?? 2;
    const used = data?.sessions.length ?? 0;
    const over = used - slots;

    return (
        <div className="dlp-root">
            <div className="dlp-topbar">
                <ThemeToggle />
            </div>
            <div className="dlp-card surface">
                <div className="dlp-header">
                    <span className="dlp-icon"><ShieldLockFill size={24} /></span>
                    <h1 className="dlp-title">Device limit reached</h1>
                    <p className="dlp-subtitle">
                        You're signed in on <strong>{used}</strong> device{used !== 1 ? "s" : ""}, but your
                        limit is <strong>{slots}</strong>. Remove at least{" "}
                        <strong>{over}</strong> device{over !== 1 ? "s" : ""} to continue.
                    </p>
                </div>

                <div className="dlp-usage-bar">
                    <div className="dlp-usage-bar-inner">
                        {Array.from({ length: Math.max(used, slots) }).map((_, i) => (
                            <div
                                key={i}
                                className={`dlp-usage-pip${i < slots ? "" : " dlp-usage-pip--over"}`}
                            />
                        ))}
                    </div>
                    <span className="dlp-usage-label">{used} / {slots} devices used</span>
                </div>

                {loading && !data ? (
                    <div className="dlp-loading">
                        <span className="spinner-border spinner-border-sm" role="status" />
                        Loading sessions…
                    </div>
                ) : (
                    <ul className="dlp-session-list">
                        {(data?.sessions ?? []).map((sess) => (
                            <li key={sess.id} className={`dlp-session${sess.is_current ? " dlp-session--current" : ""}`}>
                                <span className="dlp-session-icon">
                                    <DeviceIcon deviceName={sess.device_name} />
                                </span>
                                <div className="dlp-session-info">
                                    <span className="dlp-session-name">
                                        {sess.device_name}
                                        {sess.is_current && (
                                            <span className="dlp-badge">This device</span>
                                        )}
                                    </span>
                                    <span className="dlp-session-meta">
                                        {sess.browser} · {sess.os_name}
                                        {sess.ip_address && ` · ${sess.ip_address}`}
                                    </span>
                                    <span className="dlp-session-date">
                                        Signed in {formatDate(sess.created_at)}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    className={`dlp-revoke-btn${sess.is_current ? " dlp-revoke-btn--self" : ""}`}
                                    disabled={revoking === sess.id}
                                    onClick={() => setPendingRevoke(sess)}
                                    aria-label={sess.is_current ? "Log out this device" : "Remove device"}
                                >
                                    {revoking === sess.id ? (
                                        <span className="spinner-border spinner-border-sm" role="status" />
                                    ) : (
                                        <TrashFill size={13} />
                                    )}
                                    {sess.is_current ? "Log out" : "Remove"}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

            </div>
            {pendingRevoke && (
                <div className="dlp-confirm-overlay" role="dialog" aria-modal="true">
                    <div className="dlp-confirm-card surface">
                        <h2 className="dlp-confirm-title">
                            {pendingRevoke.is_current ? "Log out this device?" : "Remove device?"}
                        </h2>
                        <p className="dlp-confirm-body">
                            {pendingRevoke.is_current
                                ? "You'll be signed out on this device immediately."
                                : <>
                                    <strong>{pendingRevoke.device_name}</strong> will be signed out immediately.
                                </>
                            }
                        </p>
                        <div className="dlp-confirm-actions">
                            <button
                                type="button"
                                className="dlp-confirm-btn dlp-confirm-btn--cancel"
                                onClick={() => setPendingRevoke(null)}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className={`dlp-confirm-btn dlp-confirm-btn--confirm${pendingRevoke.is_current ? " dlp-confirm-btn--self" : ""}`}
                                onClick={() => {
                                    const target = pendingRevoke;
                                    setPendingRevoke(null);
                                    void handleRevoke(target);
                                }}
                            >
                                {pendingRevoke.is_current ? "Log out" : "Remove"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
