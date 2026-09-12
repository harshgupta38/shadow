import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BellFill, Check2All, Trash3 } from "react-bootstrap-icons";

import { api, ApiError, type Notification } from "@/api";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import { useToast } from "@/context/ToastContext";
import { IST_TIMEZONE, notifDateLabel, notifTime } from "@/services/date.service";
import { useTimeFormat } from "@/context/PlannerContext";
import { TYPE_COLOR, TYPE_ICON } from "@/pages/notifications/NotificationsPage.constants";
import "@/pages/notifications/NotificationsPage.scss";

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 30;

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "all" | "read" | "unread";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupByDate(items: Notification[]): { label: string; items: Notification[] }[] {
  const map = new Map<string, Notification[]>();
  for (const n of items) {
    const key = new Date(n.created_at).toLocaleDateString("en-CA", { timeZone: IST_TIMEZONE });
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(n);
  }
  return Array.from(map.entries()).map(([, groupItems]) => ({
    label: notifDateLabel(groupItems[0].created_at),
    items: groupItems,
  }));
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NotificationsPage() {
  const toast = useToast();
  const timeFormat = useTimeFormat();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("read");
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<() => void>(() => {});

  // ── Page loader — shared by initial load, retry, and error recovery ─────────

  function loadPage(beforeId?: number) {
    return api.notifications.list(false, PAGE_SIZE, beforeId).then(data => {
      setHasMore(data.length === PAGE_SIZE);
      return data;
    });
  }

  // ── Initial load ────────────────────────────────────────────────────────────

  useEffect(() => {
    setLoading(true);
    setError(null);
    loadPage().then(data => {
      setNotifications(data);
    }).catch(err => {
      setError(err instanceof ApiError ? err.message : "Couldn't load notifications.");
    }).finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load more (called by sentinel) ──────────────────────────────────────────

  loadMoreRef.current = () => {
    if (loadingMore || !hasMore) return;
    const oldestId = notifications.length > 0 ? Math.min(...notifications.map(n => n.id)) : undefined;
    setLoadingMore(true);
    loadPage(oldestId).then(batch => {
      setNotifications(prev => {
        const seen = new Set(prev.map(n => n.id));
        return [...prev, ...batch.filter(n => !seen.has(n.id))];
      });
    }).catch(() => {
      // silent — sentinel will retry on next intersection
    }).finally(() => setLoadingMore(false));
  };

  // ── IntersectionObserver — sentinel is always in the DOM ────────────────────

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMoreRef.current(); },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── Derived state ───────────────────────────────────────────────────────────

  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);

  const shown = useMemo(() => {
    if (tab === "read") return notifications.filter(n => n.read);
    if (tab === "unread") return notifications.filter(n => !n.read);
    return notifications;
  }, [tab, notifications]);

  const groups = useMemo(() => groupByDate(shown), [shown]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  function markRead(id: number) {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    api.notifications.markRead(id).catch(() => {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: false } : n));
    });
  }

  function markAllRead() {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    api.notifications.markAllRead().then(() => {
      toast.success("All caught up.");
    }).catch(() => {
      toast.error("Couldn't update notifications.");
      loadPage().then(setNotifications).catch(() => {});
    });
  }

  function confirmDelete() {
    if (pendingDeleteId === null) return;
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    setNotifications(prev => prev.filter(n => n.id !== id));
    api.notifications.delete(id).catch(() => {
      toast.error("Couldn't delete notification.");
      loadPage().then(setNotifications).catch(() => {});
    });
  }

  function retry() {
    setLoading(true);
    setError(null);
    loadPage().then(data => {
      setNotifications(data);
    }).catch(err => {
      setError(err instanceof ApiError ? err.message : "Couldn't load notifications.");
    }).finally(() => setLoading(false));
  }

  // ── Render ──────────────────────────────────────────────────────────────────

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

      {/* ── Initial loading skeleton ───────────────────────────────────── */}
      {loading && (
        <div className="surface notif-list">
          {[1, 2, 3].map(i => (
            <div key={i} className={`notif-item ${i > 1 ? "notif-item--bordered" : ""}`}>
              <div className="notif-item-icon flex-shrink-0" style={{ background: "var(--jv-surface-2)" }} />
              <div className="flex-grow-1 min-w-0 d-flex flex-column gap-2 py-1">
                <div style={{ height: 13, width: "45%", borderRadius: 4, background: "var(--jv-surface-2)" }} />
                <div style={{ height: 11, width: "30%", borderRadius: 4, background: "var(--jv-surface-2)" }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────────────── */}
      {!loading && error && (
        <div className="surface p-5 text-center">
          <BellFill size={28} className="text-muted-2 mb-3" />
          <p className="fw-semibold mb-1">Couldn't load notifications</p>
          <p className="text-muted-2 small mb-3">{error}</p>
          <button type="button" className="btn btn-brand btn-sm" onClick={retry}>Retry</button>
        </div>
      )}

      {/* ── Empty ─────────────────────────────────────────────────────── */}
      {!loading && !error && shown.length === 0 && (
        <div className="surface p-5 text-center">
          <BellFill size={28} className="text-muted-2 mb-3" />
          <p className="fw-semibold mb-1">{emptyMsg[tab].title}</p>
          <p className="text-muted-2 small mb-0">{emptyMsg[tab].sub}</p>
        </div>
      )}

      {/* ── Grouped list ──────────────────────────────────────────────── */}
      {!loading && !error && groups.length > 0 && (
        <div className="d-flex flex-column gap-3">
          {groups.map(group => (
            <div key={group.label}>
              <p className="notif-date-label">{group.label}</p>
              <div className="surface notif-list">
                {group.items.map((n, idx) => {
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
                        <span className="notif-item-time">{notifTime(n.created_at, timeFormat)}</span>
                      </div>
                      <div className="notif-item-actions" onClick={e => e.stopPropagation()}>
                        {!n.read && (
                          <button
                            type="button"
                            className="notif-item-mark-read"
                            onClick={() => markRead(n.id)}
                          >
                            Mark as read
                          </button>
                        )}
                        <button
                          type="button"
                          className="notif-item-delete"
                          title="Delete"
                          onClick={() => setPendingDeleteId(n.id)}
                        >
                          <Trash3 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Scroll sentinel — always in the DOM so IntersectionObserver attaches ── */}
      <div ref={sentinelRef} className="notif-load-more">
        {loadingMore && <span className="text-muted-2 small">Loading more…</span>}
      </div>

      <ConfirmDialog
        show={pendingDeleteId !== null}
        title="Delete notification"
        message="This notification will be permanently removed."
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
    </section>
  );
}
