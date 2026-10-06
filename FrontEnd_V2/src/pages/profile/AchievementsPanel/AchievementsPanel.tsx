import type { ReactNode } from "react";
import {
  Award,
  Bullseye,
  BriefcaseFill,
  CalendarEvent,
  ChatDotsFill,
  ClipboardCheck,
  CupHotFill,
  Diagram3,
  Fire,
  FlagFill,
  Grid3x3GapFill,
  JournalText,
  LightningChargeFill,
  LockFill,
  RocketTakeoffFill,
  StarFill,
  SunriseFill,
  TrophyFill,
} from "react-bootstrap-icons";

import type { ProfileAchievement } from "@/api";
import { Panel } from "@/pages/profile/Panel/Panel";
import "@/pages/profile/AchievementsPanel/AchievementsPanel.scss";

// Maps the icon name a ProfileAchievement carries (a plain string, since
// that's all an API response can hold) to the actual icon component to
// render. Extend this alongside whatever new icons the backend starts using.
const ACHIEVEMENT_ICONS: Record<string, ReactNode> = {
  Award: <Award size={18} />,
  Fire: <Fire size={18} />,
  SunriseFill: <SunriseFill size={18} />,
  TrophyFill: <TrophyFill size={18} />,
  LightningChargeFill: <LightningChargeFill size={18} />,
  CupHotFill: <CupHotFill size={18} />,
  JournalText: <JournalText size={18} />,
  StarFill: <StarFill size={18} />,
  Diagram3: <Diagram3 size={18} />,
  RocketTakeoffFill: <RocketTakeoffFill size={18} />,
  CalendarEvent: <CalendarEvent size={18} />,
  ClipboardCheck: <ClipboardCheck size={18} />,
  BriefcaseFill: <BriefcaseFill size={18} />,
  ChatDotsFill: <ChatDotsFill size={18} />,
  Grid3x3GapFill: <Grid3x3GapFill size={18} />,
  Bullseye: <Bullseye size={18} />,
  FlagFill: <FlagFill size={18} />,
};

function AchievementTile({ label, hint, icon, unlocked, tone }: Omit<ProfileAchievement, "key" | "icon"> & { icon: ReactNode }) {
  return (
    <div className={`pf-badge${unlocked ? " pf-badge--unlocked" : " pf-badge--locked"}`}>
      {!unlocked && (
        <span className="pf-badge-lock" aria-hidden="true">
          <LockFill size={10} />
        </span>
      )}
      <span className={`pf-badge-icon${unlocked && tone ? ` pf-badge-icon--${tone}` : ""}`}>{icon}</span>
      <span className="pf-badge-label">{label}</span>
      <span className="pf-badge-hint">{hint}</span>
    </div>
  );
}

export function AchievementsPanel({ achievements }: { achievements: ProfileAchievement[] }) {
  return (
    <Panel
      icon={<TrophyFill size={18} />}
      tone="brand"
      title="Achievements"
      desc="Milestones Shadow has tracked from your goals, habits, and streaks."
    >
      <div className="pf-badge-grid">
        {achievements.map((a) => (
          <AchievementTile
            key={a.key}
            label={a.label}
            hint={a.hint}
            icon={ACHIEVEMENT_ICONS[a.icon] ?? <Award size={18} />}
            unlocked={a.unlocked}
            tone={a.tone}
          />
        ))}
      </div>
    </Panel>
  );
}
