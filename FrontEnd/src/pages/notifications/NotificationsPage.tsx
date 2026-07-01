import { useMemo, useState } from "react";
import { BellFill, Check2All, InboxFill, Stars, InfoCircleFill } from "react-bootstrap-icons";

import { api, ApiError, type Notification, type NotificationType } from "@/api";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/context/ToastContext";
import { useAsync } from "@/hooks/useAsync";
import { relativeTime } from "@/lib/format";

const TYPE_ICON: Record<NotificationType, typeof BellFill> = {
  reminder: BellFill,
  system: InfoCircleFill,
  agent: Stars,
};

const TYPE_COLOR: Record<NotificationType, string> = {
  reminder: "var(--jv-brand-1)",
  system: "var(--jv-info)",
  agent: "var(--jv-warn)",
};

export function NotificationsPage() {
  const toast = useToast();
  const { data, loading, error, reload, setData } = useAsync(
    () => api.notifications.list(),
    [],
  );
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [markingAll, setMarkingAll] = useState(false);

  const notifications = data ?? [];
  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);
  const shown = tab === "unread" ? notifications.filter((n) => !n.read) : notifications;

  async function markRead(notification: Notification) {
    if (notification.read) return;
    setData((prev) =>
      (prev ?? []).map((n) => (n.id === notification.id ? { ...n, read: true } : n)),
    );
    try {
      await api.notifications.markRead(notification.id);
    } catch {
      reload();
    }
  }

  async function markAllRead() {
    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0) return;
    setMarkingAll(true);
    setData((prev) => (prev ?? []).map((n) => ({ ...n, read: true })));
    try {
      await Promise.all(unread.map((n) => api.notifications.markRead(n.id)));
      toast.success("All caught up.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update notifications.");
      reload();
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="Reminders and nudges from Jarvis."
        icon={<BellFill size={20} />}
        actions={
          unreadCount > 0 && (
            <button className="btn btn-outline-secondary" onClick={markAllRead} disabled={markingAll}>
              <Check2All size={16} className="me-1" /> Mark all read
            </button>
          )
        }
      />

      <div className="nav-tabs-jv mb-4">
        <button
          type="button"
          className={`nav-tab-jv ${tab === "all" ? "active" : ""}`}
          onClick={() => setTab("all")}
        >
          All
        </button>
        <button
          type="button"
          className={`nav-tab-jv ${tab === "unread" ? "active" : ""}`}
          onClick={() => setTab("unread")}
        >
          Unread {unreadCount > 0 && <span className="ms-1 text-faint">{unreadCount}</span>}
        </button>
      </div>

      {loading && <LoadingState label="Loading notifications…" />}

      {error && !loading && (
        <EmptyState
          icon={<BellFill size={26} />}
          title="Couldn't load notifications"
          message={error}
          action={
            <button className="btn btn-brand" onClick={reload}>
              Retry
            </button>
          }
        />
      )}

      {!loading && !error && shown.length === 0 && (
        <div className="surface">
          <EmptyState
            icon={<InboxFill size={26} />}
            title={tab === "unread" ? "You're all caught up" : "No notifications yet"}
            message={
              tab === "unread"
                ? "No unread notifications right now."
                : "Reminders and check-ins from Jarvis will show up here."
            }
          />
        </div>
      )}

      {!loading && !error && shown.length > 0 && (
        <div className="surface">
          {shown.map((notification, index) => {
            const Icon = TYPE_ICON[notification.type];
            return (
              <button
                key={notification.id}
                type="button"
                className={`d-flex align-items-start gap-3 w-100 text-start border-0 bg-transparent p-3 p-sm-4 ${
                  index > 0 ? "border-top" : ""
                } ${!notification.read ? "clickable" : ""}`}
                style={{ borderColor: "var(--jv-border)" }}
                onClick={() => markRead(notification)}
              >
                <span
                  className="stat-icon flex-shrink-0"
                  style={{
                    width: 40,
                    height: 40,
                    background: `${TYPE_COLOR[notification.type]}1f`,
                    color: TYPE_COLOR[notification.type],
                  }}
                >
                  <Icon size={17} />
                </span>
                <div className="flex-grow-1 min-w-0">
                  <div className="d-flex align-items-center gap-2">
                    <span className={`fw-semibold ${notification.read ? "text-muted-2" : ""}`}>
                      {notification.title}
                    </span>
                    {!notification.read && (
                      <span
                        className="dot flex-shrink-0"
                        style={{ background: "var(--jv-brand-1)" }}
                      />
                    )}
                  </div>
                  {notification.body && (
                    <p className="text-muted-2 small mb-1 mt-1">{notification.body}</p>
                  )}
                  <span className="text-faint" style={{ fontSize: "0.72rem" }}>
                    {relativeTime(notification.created_at)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
