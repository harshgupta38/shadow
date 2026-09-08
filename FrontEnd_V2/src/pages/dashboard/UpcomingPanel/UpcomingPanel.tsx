import { Link } from "react-router-dom";
import { CalendarEvent } from "react-bootstrap-icons";

import { ROUTES } from "@/routes/RoutePaths";
import { PRIORITY_COLOR } from "@/constant/priority";
import type { DashboardUpcomingItem } from "@/api";
import { fmtUpcomingDate } from "./UpcomingPanel.constants";
import "./UpcomingPanel.scss";

interface Props {
  items: DashboardUpcomingItem[];
}

export function UpcomingPanel({ items }: Props) {
  return (
    <div className="dp-panel no-gap">
      <div className="dp-panel-head mb-075">
        <CalendarEvent size={15} className="text-muted-2" />
        <h3 className="dp-panel-title">Upcoming</h3>
        <Link to={ROUTES.SCHEDULE} className="dp-section-link">View all →</Link>
      </div>
      {items.length === 0 ? (
        <div className="dp-upcoming-empty">
          <span className="dp-upcoming-empty-icon" aria-hidden="true">📅</span>
          <p className="dp-upcoming-empty-title">Nothing on the calendar</p>
          <p className="dp-upcoming-empty-sub">You don't have anything scheduled in the next few days.</p>
        </div>
      ) : (
        items.map((item) => (
          <div key={`${item.repeat_yearly ? "y" : "n"}-${item.id}`} className="dp-upcoming-item">
            <span className="dp-upcoming-dot" style={{ background: PRIORITY_COLOR[item.priority] }} />
            <div className="dp-upcoming-body">
              <div className="dp-upcoming-row1">
                <span className="dp-upcoming-title">{item.title}</span>
                <span className="dp-upcoming-date">{fmtUpcomingDate(item.scheduled_date)}</span>
              </div>
              {item.note && <p className="dp-upcoming-note">{item.note}</p>}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
