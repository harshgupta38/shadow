import { CalendarCheck, EnvelopeFill, PencilFill } from "react-bootstrap-icons";

import type { DateFormat } from "@/api";
import { formatDisplayDate } from "@/services/date.service";
import "@/pages/profile/ProfileHero/ProfileHero.scss";

export interface ProfileHeroProps {
  displayName: string;
  email: string;
  joinedAt: string;
  dateFormat: DateFormat;
  bio: string;
  onEditBio: () => void;
}

function getInitials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "Y"
  );
}

export function ProfileHero({ displayName, email, joinedAt, dateFormat, bio, onEditBio }: ProfileHeroProps) {
  return (
    <div className="surface pf-hero">
      <div className="pf-hero-cover" aria-hidden="true" />
      <div className="pf-hero-content">
        <div className="pf-avatar-block">
          <div className="pf-avatar">
            <span>{getInitials(displayName)}</span>
          </div>
        </div>

        <div className="pf-identity">
          <div className="pf-name-line">
            <h1 className="pf-name">{displayName}</h1>
          </div>

          <div className="pf-meta-line">
            <span className="pf-meta-item"><EnvelopeFill size={12} /> {email}</span>
            <span className="pf-meta-dot" aria-hidden="true" />
            <span className="pf-meta-item">
              <CalendarCheck size={12} /> Member since {formatDisplayDate(joinedAt, dateFormat)}
            </span>
          </div>

          <div className="pf-bio-line">
            <p className="pf-bio-text">
              {bio || "Add a short bio to tell Shadow what you're working toward."}
            </p>
            <button type="button" className="pf-edit-btn" aria-label="Edit bio" onClick={onEditBio}>
              <PencilFill size={11} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
