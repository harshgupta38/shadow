import { useEffect, useRef, useState } from "react";
import { BellFill } from "react-bootstrap-icons";
import type { NotificationSettings } from "@/api";
import { Card, FieldRow, ToggleRow } from "@/pages/settings/SettingsShared";
import "@/pages/settings/NotificationsCard/NotificationsCard.scss";

type DeviceStatus = "idle" | "connecting" | "connected" | "failed" | "disconnecting";

export function NotificationsCard({
  data,
  isDirty,
  onUpdate,
}: {
  data: NotificationSettings;
  isDirty: boolean;
  onUpdate: (d: NotificationSettings) => void;
}) {
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus>("idle");
  const prevPush = useRef(data.push_notifications_enabled);
  const isMounted = useRef(true);

  useEffect(() => { return () => { isMounted.current = false; }; }, []);

  function set<K extends keyof NotificationSettings>(key: K, value: NotificationSettings[K]) {
    onUpdate({ ...data, [key]: value });
  }

  useEffect(() => {
    if (data.push_notifications_enabled && !prevPush.current) {
      void attemptConnect();
    }
    prevPush.current = data.push_notifications_enabled;
  }, [data.push_notifications_enabled]);

  async function attemptConnect() {
    setDeviceStatus("connecting");
    await new Promise((r) => setTimeout(r, 1400));
    if (!isMounted.current) return;
    setDeviceStatus(Math.random() > 0.2 ? "connected" : "failed");
  }

  async function disconnect() {
    setDeviceStatus("disconnecting");
    await new Promise((r) => setTimeout(r, 900));
    if (!isMounted.current) return;
    setDeviceStatus("idle");
    set("push_notifications_enabled", false);
  }

  const showStatusRow = data.push_notifications_enabled || deviceStatus === "disconnecting";

  return (
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
              checked={data.push_notifications_enabled}
              className="pt-1"
              onChange={(v) => {
                if (!v) { void disconnect(); }
                else { set("push_notifications_enabled", v); }
              }}
            />

            {showStatusRow && (
              <div className="st-device-status-row">
                {deviceStatus === "connecting" && (
                  <span className="st-device-pill st-device-pill--connecting">
                    <span className="st-device-dot" />
                    Connecting…
                  </span>
                )}
                {deviceStatus === "disconnecting" && (
                  <span className="st-device-pill st-device-pill--connecting">
                    <span className="st-device-dot" />
                    Disconnecting…
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
                {(deviceStatus === "failed" || deviceStatus === "idle") && (
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
                      Connect this device
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
              description="Reminders before scheduled tasks"
              checked={data.reminder_notifications_enabled}
              onChange={(v) => set("reminder_notifications_enabled", v)}
            />
            <ToggleRow
              label="Daily brief"
              description="Morning summary of your day's plan"
              checked={data.daily_brief_enabled}
              onChange={(v) => set("daily_brief_enabled", v)}
            />
            {data.daily_brief_enabled && (
              <FieldRow label="Brief delivery time" hint="When the morning brief is sent to you">
                <input
                  type="time"
                  className="form-control form-control-sm st-time-input"
                  value={data.daily_brief_time}
                  onChange={(e) => set("daily_brief_time", e.target.value)}
                />
              </FieldRow>
            )}
            <ToggleRow
              label="Weekly summary"
              description="A snapshot of your progress every Sunday"
              checked={data.weekly_summary_enabled}
              onChange={(v) => set("weekly_summary_enabled", v)}
            />
          </div>

          <div className="st-toggle-group">
            <span className="st-group-label">Quiet Hours</span>
            <ToggleRow
              label="Quiet hours"
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
  );
}
