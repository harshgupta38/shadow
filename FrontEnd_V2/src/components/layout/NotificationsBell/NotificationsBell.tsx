import { useEffect, useState } from "react";
import { Dropdown } from "react-bootstrap";
import { useLocation, useNavigate } from "react-router-dom";
import { BellFill } from "react-bootstrap-icons";

import { api, type Notification } from "@/api";
import { ROUTES } from "@/routes/RoutePaths";
import { relativeTime } from "@/services/date.service";
import { TYPE_COLOR, TYPE_ICON } from "@/pages/notifications/NotificationsPage.constants";
import "@/components/layout/NotificationsBell/NotificationsBell.scss";

export function NotificationsBell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [snapshot, setSnapshot] = useState<Notification[]>([]);

  // ── Initial fetch + SSE with exponential-backoff reconnect ─────────────────
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const MAX_RETRIES = 8;

    (async () => {
      // Initial list — runs once; stream reconnects keep lastSeenId up to date
      let lastSeenId = 0;
      try {
        const data = await api.notifications.list(true);
        if (signal.aborted) return;
        setNotifications(data);
        lastSeenId = data.length > 0 ? Math.max(...data.map(n => n.id)) : 0;
      } catch {
        if (signal.aborted) return;
        // continue — stream is still useful even when the initial fetch fails
      }

      let retries = 0;
      while (!signal.aborted && retries <= MAX_RETRIES) {
        try {
          await api.notifications.stream(lastSeenId, (notif) => {
            lastSeenId = Math.max(lastSeenId, notif.id);
            setNotifications(prev => prev.some(n => n.id === notif.id) ? prev : [notif, ...prev]);
          }, signal);
          retries = 0; // clean close → reset counter before reconnecting
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return;
          retries++;
        }

        if (signal.aborted || retries > MAX_RETRIES) break;

        // Exponential backoff capped at 30 s: 1 s, 2 s, 4 s, 8 s, 16 s, 30 s …
        const delayMs = Math.min(1_000 * 2 ** (retries - 1), 30_000);
        await new Promise<void>(resolve => {
          const t = setTimeout(resolve, delayMs);
          signal.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
        });
      }
    })().catch(() => {});

    return () => controller.abort();
  }, []);

  // ── Auto-close when user navigates to the notifications page ────────────────
  if (open && location.pathname === ROUTES.NOTIFICATIONS) {
    setOpen(false);
    setSnapshot([]);
  }

  const unread = notifications.filter(n => !n.read);
  const unreadCount = unread.length;

  function onToggle(nextShow: boolean) {
    setOpen(nextShow);
    if (nextShow) {
      // Snapshot the current unread items before marking them read
      const items = unread.slice(0, 10);
      setSnapshot(items);
      const ids = items.map(n => n.id);
      setNotifications(prev => prev.map(n => ids.includes(n.id) ? { ...n, read: true } : n));
      api.notifications.markReadBatch(ids).catch(() => {
        // All items came from `unread`, so their original state is read: false
        setNotifications(prev => prev.map(n => ids.includes(n.id) ? { ...n, read: false } : n));
      });
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
