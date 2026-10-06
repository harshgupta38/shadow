import { useCallback, useEffect, useState } from "react";
import {
    Display,
    LaptopFill,
    PencilFill,
    PhoneFill,
    ShieldLockFill,
    TabletFill,
    TrashFill,
} from "react-bootstrap-icons";

import { api, ApiError } from "@/api";
import type { SessionInfo, SessionsListResponse } from "@/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { TextFieldPromptDialog } from "@/components/ui/TextFieldPromptDialog/TextFieldPromptDialog";
import { Card } from "@/pages/settings/SettingsShared";
import { parseServerDate } from "@/services/date.service";
import "@/pages/settings/SessionsCard/SessionsCard.scss";

function DeviceIcon({ deviceName }: { deviceName: string }) {
    const l = deviceName.toLowerCase();
    if (l.includes("iphone") || l.includes("android phone")) return <PhoneFill size={16} />;
    if (l.includes("ipad") || l.includes("tablet")) return <TabletFill size={16} />;
    if (l.includes("mac") || l.includes("laptop")) return <LaptopFill size={16} />;
    return <Display size={16} />;
}

function timeAgo(iso: string): string {
    const diff = Math.floor((Date.now() - parseServerDate(iso).getTime()) / 1000);
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

export function SessionsCard() {
    const { logout } = useAuth();
    const { success, error: toastError } = useToast();

    const [data, setData] = useState<SessionsListResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [confirming, setConfirming] = useState<SessionInfo | null>(null);
    const [revoking, setRevoking] = useState(false);
    const [renaming, setRenaming] = useState<SessionInfo | null>(null);
    const [savingName, setSavingName] = useState(false);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            setData(await api.auth.getSessions());
        } catch {
            toastError("Could not load active sessions.");
        } finally {
            setLoading(false);
        }
    }, [toastError]);

    useEffect(() => { void load(); }, [load]);

    async function handleRevoke() {
        if (!confirming) return;
        if (confirming.is_current) { logout(); return; }
        setRevoking(true);
        try {
            await api.auth.revokeSession(confirming.id);
            success("Device removed.");
            setConfirming(null);
            await load();
        } catch (err) {
            toastError(err instanceof ApiError ? err.message : "Could not remove device.");
        } finally {
            setRevoking(false);
        }
    }

    async function handleRename(value: string) {
        if (!renaming) return;
        setSavingName(true);
        try {
            await api.auth.renameSession(renaming.id, value.trim() || null);
            setRenaming(null);
            await load();
        } catch (err) {
            toastError(err instanceof ApiError ? err.message : "Could not rename device.");
        } finally {
            setSavingName(false);
        }
    }

    const sessions = data?.sessions ?? [];

    return (
        <>
            <Card
                icon={<ShieldLockFill size={16} />}
                title="Active Sessions"
                desc="Devices currently signed in to your account. Remove any session you don't recognise."
                isDirty={false}
            >
                {loading && !data ? (
                    <div className="sc-loading">
                        <span className="spinner-border spinner-border-sm" role="status" />
                        <span>Loading sessions…</span>
                    </div>
                ) : (
                    <ul className="sc-list">
                        {sessions.map((sess) => (
                            <li
                                key={sess.id}
                                className={`sc-row${sess.is_current ? " sc-row--current" : ""}`}
                            >
                                <span className="sc-icon">
                                    <DeviceIcon deviceName={sess.device_name} />
                                </span>
                                <div className="sc-info">
                                    <span className="sc-name">
                                        {sess.custom_name || sess.device_name}
                                        <button
                                            type="button"
                                            className="sc-rename-btn"
                                            aria-label="Rename device"
                                            onClick={() => setRenaming(sess)}
                                        >
                                            <PencilFill size={11} />
                                        </button>
                                        {sess.is_current && (
                                            <span className="sc-badge">This device</span>
                                        )}
                                    </span>
                                    <span className="sc-meta">
                                        {sess.browser} · {sess.os_name}
                                    </span>
                                    <span className="sc-time">
                                        Active {timeAgo(sess.last_seen_at)} · Signed in {timeAgo(sess.created_at)}
                                    </span>
                                </div>
                                <div className="sc-actions">
                                    <button
                                        type="button"
                                        className={`sc-btn${sess.is_current ? " sc-btn--self" : ""}`}
                                        onClick={() => setConfirming(sess)}
                                    >
                                        <TrashFill size={12} />
                                        {sess.is_current ? "Log out" : "Remove"}
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </Card>

            <ConfirmDialog
                show={confirming !== null}
                title="Remove session?"
                message={confirming
                    ? `${confirming.device_name} (${confirming.browser} · ${confirming.os_name}) will be signed out immediately.`
                    : ""}
                confirmLabel="Remove"
                destructive
                busy={revoking}
                onConfirm={() => void handleRevoke()}
                onCancel={() => setConfirming(null)}
            />

            <TextFieldPromptDialog
                show={renaming !== null}
                title="Rename device"
                message="Give this device a name you'll recognise. Clear it to use the default name again."
                label="Device name"
                initialValue={renaming?.custom_name ?? ""}
                placeholder={renaming?.device_name}
                confirmLabel="Save"
                busy={savingName}
                maxLength={60}
                allowEmpty
                onConfirm={(value) => void handleRename(value)}
                onCancel={() => setRenaming(null)}
            />
        </>
    );
}
