import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BellFill, Check2All } from "react-bootstrap-icons";

import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import { useToast } from "@/context/ToastContext";
import { notifTime } from "@/services/date.service";
import { MOCK_NOTIFICATIONS, TYPE_COLOR, TYPE_ICON } from "@/pages/notifications/NotificationsPage.constants";
import "@/pages/notifications/NotificationsPage.scss";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "all" | "read" | "unread";

// ─── Component ────────────────────────────────────────────────────────────────

export function NotificationsPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState(MOCK_NOTIFICATIONS);
  const [tab, setTab] = useState<Tab>("unread");

  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);

  const shown = useMemo(() => {
    if (tab === "read") return notifications.filter(n => n.read);
    if (tab === "unread") return notifications.filter(n => !n.read);
    return notifications;
  }, [tab, notifications]);

  function markRead(id: number) {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }

  function markAllRead() {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    toast.success("All caught up.");
  }

  const emptyMsg = {
    all: { title: "No notifications yet", sub: "Reminders and updates from Shadow will show up here." },
    read: { title: "No read notifications", sub: "Notifications you've read will appear here." },
    unread: { title: "You're all caught up", sub: "No unread notifications right now." },
  } satisfies Record<Tab, { title: string; sub: string }>;

  return (
    <section className="notif-page">
      <PageHeader
        icon={<BellFill size={20} />}
        title="Notifications"
        subtitle="Reminders and updates from Shadow."
        actions={unreadCount > 0 ? [
          {
            key: "mark-all-read",
            label: "Mark all read",
            icon: <Check2All size={15} />,
            tone: "soft",
            onClick: markAllRead,
          },
        ] : []}
      />

      {/* ── Tabs ──────────────────────────────────────────────────────── */}
      <div className="nav-tabs-jv mb-4" role="tablist" style={{ alignSelf: "flex-start" }}>
        {(["all", "read", "unread"] as Tab[]).map(t => (
          <button
            key={t}
            type="button"
            className={`nav-tab-jv ${tab === t ? "active" : ""}`}
            onClick={() => setTab(t)}
            role="tab"
            aria-selected={tab === t}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {t === "unread" && unreadCount > 0 && (
              <span className="ms-1 text-faint">{unreadCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Empty ─────────────────────────────────────────────────────── */}
      {shown.length === 0 && (
        <div className="surface p-5 text-center">
          <BellFill size={28} className="text-muted-2 mb-3" />
          <p className="fw-semibold mb-1">{emptyMsg[tab].title}</p>
          <p className="text-muted-2 small mb-0">{emptyMsg[tab].sub}</p>
        </div>
      )}

      {/* ── List ──────────────────────────────────────────────────────── */}
      {shown.length > 0 && (
        <div className="surface notif-list">
          {shown.map((n, idx) => {
            const Icon = TYPE_ICON[n.type];
            return (
              <div
                key={n.id}
                className={`notif-item ${idx > 0 ? "notif-item--bordered" : ""} ${!n.read ? "notif-item--unread" : ""} ${n.url ? "notif-item--clickable" : ""}`}
                onClick={() => { if (n.url) navigate(n.url); }}
              >
                <span className="notif-item-icon flex-shrink-0" style={{ background: `${TYPE_COLOR[n.type]}22`, color: TYPE_COLOR[n.type] }}>
                  <Icon size={17} />
                </span>
                <div className="flex-grow-1 min-w-0">
                  <div className="d-flex align-items-center gap-2">
                    <span className={`fw-semibold small ${n.read ? "text-muted-2" : ""}`}>{n.title}</span>
                    {!n.read && <span className="notif-item-dot" />}
                  </div>
                  {n.body && <p className="text-muted-2 small mb-1 mt-1">{n.body}</p>}
                  <span className="notif-item-time">{notifTime(n.created_at)}</span>
                </div>
                {!n.read && (
                  <button
                    type="button"
                    className="notif-item-mark-read flex-shrink-0"
                    onClick={(e) => { e.stopPropagation(); markRead(n.id); }}
                  >
                    Mark as read
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
