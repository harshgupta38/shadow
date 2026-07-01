import { useNavigate } from "react-router-dom";
import { BellFill } from "react-bootstrap-icons";

import { api } from "@/api";
import { useAsync } from "@/hooks/useAsync";

/** Bell icon linking to the notifications page, with an unread badge. */
export function NotificationsBell() {
  const navigate = useNavigate();
  const { data } = useAsync(() => api.notifications.list(true), []);
  const unread = data?.length ?? 0;

  return (
    <button
      type="button"
      className="btn btn-ghost btn-icon position-relative"
      aria-label={unread > 0 ? `${unread} unread notifications` : "Notifications"}
      title="Notifications"
      onClick={() => navigate("/notifications")}
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
    </button>
  );
}
