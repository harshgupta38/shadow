import { useState } from "react";

import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { useDateFormat } from "@/context/PlannerContext";
import { TextFieldPromptDialog } from "@/components/ui/TextFieldPromptDialog/TextFieldPromptDialog";
import { MOCK_PROFILE } from "@/pages/profile/ProfilePage.mock";
import { ProfileHero } from "@/pages/profile/ProfileHero/ProfileHero";
import { ProfileStats } from "@/pages/profile/ProfileStats/ProfileStats";
import { AchievementsPanel } from "@/pages/profile/AchievementsPanel/AchievementsPanel";
import { ThisMonthPanel } from "@/pages/profile/ThisMonthPanel/ThisMonthPanel";
import { AppPreferencesPanel } from "@/pages/profile/AppPreferencesPanel/AppPreferencesPanel";
import { AccountSecurityPanel } from "@/pages/profile/AccountSecurityPanel/AccountSecurityPanel";
import { DangerZonePanel } from "@/pages/profile/DangerZonePanel/DangerZonePanel";
import "@/pages/profile/ProfilePage.scss";

export function ProfilePage() {
  const { user } = useAuth();
  const { success } = useToast();
  const dateFormat = useDateFormat();

  // Stand-in for the eventual `const [profile, setProfile] = useState(...)` +
  // fetch — everything below reads from this one object, same as the real
  // endpoint response will look, so swapping it out later is a one-line change.
  const profile = MOCK_PROFILE;

  const [displayName, setDisplayName] = useState(user?.name ?? "You");
  const [bio, setBio] = useState(profile.bio ?? "");

  const [editingName, setEditingName] = useState(false);
  const [editingBio, setEditingBio] = useState(false);

  function saveName(value: string) {
    setDisplayName(value.trim());
    setEditingName(false);
    success("Profile updated.");
  }

  function saveBio(value: string) {
    setBio(value.trim());
    setEditingBio(false);
    success("Profile updated.");
  }

  return (
    <section className="profile-page">
      <ProfileHero
        displayName={displayName}
        email={user?.email ?? ""}
        joinedAt={profile.joined_at}
        dateFormat={dateFormat}
        bio={bio}
        onEditBio={() => setEditingBio(true)}
      />

      <ProfileStats profile={profile} />

      <div className="row g-3">
        <div className="col-xl-7 d-flex flex-column gap-3">
          <AchievementsPanel achievements={profile.achievements} />
        </div>

        <div className="col-xl-5 d-flex flex-column gap-3">
          <ThisMonthPanel profile={profile} />
          <AppPreferencesPanel />
          <AccountSecurityPanel
            displayName={displayName}
            email={user?.email ?? ""}
            emailVerified={profile.email_verified}
            onEditName={() => setEditingName(true)}
          />
          <DangerZonePanel />
        </div>
      </div>

      <TextFieldPromptDialog
        show={editingName}
        title="Edit name"
        label="Full name"
        initialValue={displayName}
        maxLength={60}
        onConfirm={saveName}
        onCancel={() => setEditingName(false)}
      />

      <TextFieldPromptDialog
        show={editingBio}
        title="Edit bio"
        message="A short line shown on your profile."
        label="Bio"
        initialValue={bio}
        placeholder="e.g. Product manager leveling up my career and health this year."
        maxLength={140}
        allowEmpty
        onConfirm={saveBio}
        onCancel={() => setEditingBio(false)}
      />
    </section>
  );
}
