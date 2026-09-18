import { useEffect, useRef, useState } from "react";
import { BellFill } from "react-bootstrap-icons";
import type { NotificationSettings } from "@/api";
import { api } from "@/api";
import { Card, ToggleRow } from "@/pages/settings/SettingsShared";
import "@/pages/settings/NotificationsCard/NotificationsCard.scss";

type DeviceStatus = "idle" | "connecting" | "connected" | "failed" | "disconnecting";

// ─── Permission-denied modal ──────────────────────────────────────────────────

function PermissionDeniedModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="st-push-modal-backdrop" onClick={onClose}>
      <div className="st-push-modal" onClick={(e) => e.stopPropagation()}>
        <h5 className="st-push-modal-title">Notifications blocked</h5>
        <p className="st-push-modal-body">
          Your browser is blocking notifications for this site. To enable push
          alerts, open your browser&apos;s site settings and set Notifications
          to <strong>Allow</strong>, then try again.
        </p>
        <button type="button" className="btn btn-sm btn-primary" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function base64UrlToArrayBuffer(base64Url: string): ArrayBuffer {
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function toPushPayload(sub: PushSubscription) {
  const keys = sub.toJSON().keys ?? {};
  return {
    endpoint: sub.endpoint,
    p256dh: keys["p256dh"] ?? "",
    auth: keys["auth"] ?? "",
    user_agent: navigator.userAgent,
  };
}

async function getOrCreateSubscription(publicKey: string): Promise<PushSubscription> {
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToArrayBuffer(publicKey),
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NotificationsCard({
  data,
  isDirty,
  onUpdate,
}: {
  data: NotificationSettings;
  isDirty: boolean;
  onUpdate: (d: NotificationSettings) => void;
}) {
  // Push is per-device (a browser subscription), never a synced user preference —
  // its checked state is derived entirely from this device's actual subscription,
  // never from the backend-synced NotificationSettings object.
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus>("idle");
  const [showDeniedModal, setShowDeniedModal] = useState(false);
  // Track whether we're running a push operation so concurrent calls are ignored
  const busy = useRef(false);

  function set<K extends keyof NotificationSettings>(key: K, value: NotificationSettings[K]) {
    onUpdate({ ...data, [key]: value });
  }

  // On mount: check if this device already has an active push subscription and
  // sync the toggle + status to match reality (handles page refresh).
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setDeviceStatus(sub ? "connected" : "idle"))
      .catch(() => {/* best-effort */});
  }, []);

  async function attemptConnect() {
    if (busy.current) return;
    busy.current = true;

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setDeviceStatus("failed");
      busy.current = false;
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === "denied") {
      setShowDeniedModal(true);
      setDeviceStatus("idle");
      busy.current = false;
      return;
    }
    if (permission !== "granted") {
      setDeviceStatus("idle");
      busy.current = false;
      return;
    }

    setDeviceStatus("connecting");

    try {
      const { public_key } = await api.notifications.getPushPublicKey();
      const sub = await getOrCreateSubscription(public_key);
      const payload = toPushPayload(sub);
      await api.notifications.subscribePush(payload);
      try {
        await api.notifications.sendDeviceConnectedAlert(payload.endpoint);
      } catch { /* non-fatal */ }
      setDeviceStatus("connected");
    } catch (err) {
      console.warn("Push subscription failed:", err);
      setDeviceStatus("failed");
    } finally {
      busy.current = false;
    }
  }

  async function disconnect() {
    if (busy.current) return;
    busy.current = true;
    setDeviceStatus("disconnecting");
    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          const payload = toPushPayload(sub);
          await sub.unsubscribe();
          try { await api.notifications.unsubscribePush(payload); } catch { /* best-effort */ }
        }
      }
    } finally {
      setDeviceStatus("idle");
      busy.current = false;
    }
  }

  const pushChecked = deviceStatus === "connected" || deviceStatus === "connecting";
  const showStatusRow = deviceStatus !== "idle";

  return (
    <>
      {showDeniedModal && <PermissionDeniedModal onClose={() => setShowDeniedModal(false)} />}

      <Card
        className="notifications-card"
        icon={<BellFill size={16} />}
        title="Notifications"
        desc="Decide what Shadow alerts you about and when."
        isDirty={isDirty}
      >
        <ToggleRow
          label="Enable notifications"
          description="Master switch — turns all alerts on or off"
          checked={data.notifications_enabled}
          className="pb-0"
          onChange={(v) => set("notifications_enabled", v)}
        />

        <div className={`st-notif-expand${data.notifications_enabled ? " st-notif-expand--open" : ""}`}>
          <div className="st-notif-expand-inner">
            <div className="st-toggle-group mt-1">
              <span className="st-group-label">Channels</span>

              <ToggleRow
                label="Push notifications"
                description="Instant alerts sent directly to this device."
                checked={pushChecked}
                className="pt-1 pb-2"
                onChange={(v) => {
                  if (v) void attemptConnect();
                  else void disconnect();
                }}
              />

              {showStatusRow && (
                <div className="st-device-status-row">
                  {(deviceStatus === "connecting" || deviceStatus === "disconnecting") && (
                    <span className="st-device-pill st-device-pill--connecting">
                      <span className="st-device-dot" />
                      {deviceStatus === "connecting" ? "Connecting…" : "Disconnecting…"}
                    </span>
                  )}
                  {deviceStatus === "connected" && (
                    <>
                      <span className="st-device-pill st-device-pill--connected">
                        <span className="st-device-dot" />
                        Connected
                      </span>
                      <button
                        type="button"
                        className="st-device-cta st-device-cta--ghost"
                        onClick={() => void disconnect()}
                      >
                        Disconnect
                      </button>
                    </>
                  )}
                  {deviceStatus === "failed" && (
                    <>
                      <span className="st-device-pill st-device-pill--failed">
                        <span className="st-device-dot" />
                        Not connected
                      </span>
                      <button
                        type="button"
                        className="st-device-cta st-device-cta--primary"
                        onClick={() => void attemptConnect()}
                      >
                        Try again
                      </button>
                    </>
                  )}
                </div>
              )}

              <ToggleRow
                label="Email notifications"
                description="Summary emails and important alerts"
                checked={data.email_notifications_enabled}
                onChange={(v) => set("email_notifications_enabled", v)}
              />
            </div>

            <div className="st-toggle-group">
              <span className="st-group-label">Alert types</span>
              <ToggleRow
                label="Task reminders"
                className="pt-1 pb-2"
                description="Reminders before scheduled tasks"
                checked={data.reminder_notifications_enabled}
                onChange={(v) => set("reminder_notifications_enabled", v)}
              />
              <ToggleRow
                label="Daily brief"
                description="A warm assistant summary sent when your plan is generated each morning"
                checked={data.daily_brief_enabled}
                onChange={(v) => set("daily_brief_enabled", v)}
              />
            </div>

            <div className="st-toggle-group">
              <span className="st-group-label">Quiet Hours</span>
              <ToggleRow
                label="Quiet hours"
                className="pt-1"
                description="Pause all notifications during a set time window."
                checked={data.quiet_hours_enabled}
                onChange={(v) => set("quiet_hours_enabled", v)}
              />
              {data.quiet_hours_enabled && (
                <>
                  <div className="st-quiet-range">
                    <span className="st-quiet-range-label">Don't notify between</span>
                    <div className="st-quiet-range-inputs">
                      <input
                        type="time"
                        className="form-control form-control-sm st-time-input"
                        value={data.quiet_hours_start}
                        onChange={(e) => set("quiet_hours_start", e.target.value)}
                        aria-label="Quiet hours start"
                      />
                      <span className="st-quiet-range-arrow">→</span>
                      <input
                        type="time"
                        className="form-control form-control-sm st-time-input"
                        value={data.quiet_hours_end}
                        onChange={(e) => set("quiet_hours_end", e.target.value)}
                        aria-label="Quiet hours end"
                      />
                    </div>
                  </div>
                  <ToggleRow
                    label="Allow urgent notifications"
                    description="Critical alerts can still come through during quiet hours."
                    checked={data.quiet_hours_allow_urgent}
                    onChange={(v) => set("quiet_hours_allow_urgent", v)}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </Card>
    </>
  );
}
