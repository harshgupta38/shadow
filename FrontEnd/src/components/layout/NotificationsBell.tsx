import { Dropdown } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import { BellFill, InfoCircleFill, Stars } from "react-bootstrap-icons";

import { api, type NotificationType } from "@/api";
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

/** Bell icon linking to the notifications page, with an unread badge. */
export function NotificationsBell() {
  const navigate = useNavigate();
  const { data, loading, error } = useAsync(() => api.notifications.list(), []);
  const notifications = data ?? [];
  const unread = notifications.filter((notification) => !notification.read).length;
  const latestNotifications = notifications.slice(0, 10);

  return (
    <Dropdown align="end">
      <Dropdown.Toggle
        as="button"
        type="button"
        className="btn btn-ghost btn-icon position-relative border-0"
        aria-label={unread > 0 ? `${unread} unread notifications` : "Notifications"}
        title="Notifications"
      >
        <BellFill size={18} />
        {unread > 0 && (
          <span
            className="position-absolute translate-middle badge rounded-pill"
            style={{
              top: 8,
              left: "72%",
              background: "var(--jv-danger)",
              fontSize: "0.62rem",
              padding: "0.2rem 0.35rem",
            }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Dropdown.Toggle>

      <Dropdown.Menu className="notifications-bell-menu">
        <div className="px-3 py-2 border-bottom" style={{ borderColor: "var(--jv-border)" }}>
          <div className="fw-semibold small">Latest notifications</div>
          <div className="text-faint" style={{ fontSize: "0.72rem" }}>
            {unread > 0 ? `${unread} unread` : "All caught up"}
          </div>
        </div>

        {loading && (
          <div className="px-3 py-3 small text-muted-2">Loading notifications...</div>
        )}

        {!loading && error && (
          <div className="px-3 py-3 small text-muted-2">Couldn't load notifications.</div>
        )}

        {!loading && !error && latestNotifications.length === 0 && (
          <div className="px-3 py-3 small text-muted-2">No notifications yet.</div>
        )}

        {!loading && !error && latestNotifications.length > 0 && (
          <div className="notifications-bell-list">
            {latestNotifications.map((notification) => {
              const Icon = TYPE_ICON[notification.type];
              return (
                <div
                  key={notification.id}
                  className="px-3 py-2 border-bottom"
                  style={{ borderColor: "var(--jv-border)" }}
                >
                  <div className="d-flex align-items-start gap-2">
                    <Icon size={14} className="mt-1 flex-shrink-0" style={{ color: TYPE_COLOR[notification.type] }} />
                    <div className="min-w-0">
                      <div className="small fw-semibold text-truncate">{notification.title}</div>
                      {notification.body && (
                        <div className="small text-muted-2">{notification.body}</div>
                      )}
                      <div className="text-faint" style={{ fontSize: "0.7rem" }}>
                        {relativeTime(notification.created_at)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="p-2 border-top" style={{ borderColor: "var(--jv-border)" }}>
          <button
            type="button"
            className="btn btn-soft btn-sm w-100"
            onClick={() => navigate("/notifications")}
          >
            Show all notifications
          </button>
        </div>
      </Dropdown.Menu>
    </Dropdown>
  );
}
