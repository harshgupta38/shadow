import { useState } from "react";
import { Dropdown } from "react-bootstrap";
import { useLocation, useNavigate } from "react-router-dom";
import { BellFill } from "react-bootstrap-icons";

import { type Notification } from "@/api/types";
import { ROUTES } from "@/routes/RoutePaths";
import { relativeTime } from "@/services/date.service";
import { MOCK_NOTIFICATIONS, TYPE_COLOR, TYPE_ICON } from "@/pages/notifications/NotificationsPage.constants";
import "@/components/layout/NotificationsBell/NotificationsBell.scss";

export function NotificationsBell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState(MOCK_NOTIFICATIONS);
  const [snapshot, setSnapshot] = useState<Notification[]>([]);

  const unread = notifications.filter(n => !n.read);
  const unreadCount = unread.length;

  // Close the bell when the user navigates to the notifications page
  if (open && location.pathname === ROUTES.NOTIFICATIONS) {
    setOpen(false);
    setSnapshot([]);
  }

  function onToggle(nextShow: boolean) {
    setOpen(nextShow);
    if (nextShow) {
      const items = unread.slice(0, 10);
      setSnapshot(items);
      const ids = items.map(n => n.id);
      setNotifications(prev => prev.map(n => ids.includes(n.id) ? { ...n, read: true } : n));
    } else {
      setSnapshot([]);
    }
  }

  return (
    <Dropdown align="end" show={open} onToggle={onToggle}>
      <Dropdown.Toggle
        as="button"
        type="button"
        className="btn btn-ghost btn-icon position-relative border-0"
        aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
        title="Notifications"
      >
        <BellFill size={18} />
        {unreadCount > 0 && (
          <span
            className="position-absolute translate-middle badge rounded-pill"
            style={{ top: 8, left: "72%", background: "var(--jv-danger)", fontSize: "0.62rem", padding: "0.2rem 0.35rem" }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Dropdown.Toggle>

      <Dropdown.Menu className="notifications-bell-menu">
        <div className="px-3 py-2 border-bottom" style={{ borderColor: "var(--jv-border)" }}>
          <div className="fw-semibold small">Latest notifications</div>
          <div className="text-faint" style={{ fontSize: "0.72rem" }}>
            {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
          </div>
        </div>

        {snapshot.length === 0 ? (
          <div className="px-3 py-3 small text-muted-2">No unread notifications.</div>
        ) : (
          <div className="notifications-bell-list">
            {snapshot.map((n: Notification) => {
              const Icon = TYPE_ICON[n.type];
              return (
                <div
                  key={n.id}
                  className="px-3 py-2 border-bottom notifications-bell-item"
                  style={{ borderColor: "var(--jv-border)", cursor: n.url ? "pointer" : "default" }}
                  onClick={() => { if (n.url) { setOpen(false); navigate(n.url); } }}
                >
                  <div className="d-flex align-items-start gap-2">
                    <Icon size={14} className="mt-1 flex-shrink-0" style={{ color: TYPE_COLOR[n.type] }} />
                    <div className="min-w-0">
                      <div className="small fw-semibold text-truncate">{n.title}</div>
                      {n.body && <div className="small text-muted-2">{n.body}</div>}
                      <div className="text-faint" style={{ fontSize: "0.7rem" }}>{relativeTime(n.created_at)}</div>
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
            onClick={() => { setOpen(false); navigate(ROUTES.NOTIFICATIONS); }}
          >
            Show all notifications
          </button>
        </div>
      </Dropdown.Menu>
    </Dropdown>
  );
}
