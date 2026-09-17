import { useCallback, useEffect, useState } from "react";

import { api, type ProfileResponse } from "@/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { useDateFormat } from "@/context/PlannerContext";
import { TextFieldPromptDialog } from "@/components/ui/TextFieldPromptDialog/TextFieldPromptDialog";
import { IllustratedErrorState } from "@/components/ui/IllustratedErrorState/IllustratedErrorState";
import { ProfileSkeleton } from "@/pages/profile/ProfileSkeleton/ProfileSkeleton";
import { ProfileHero } from "@/pages/profile/ProfileHero/ProfileHero";
import { ProfileStats } from "@/pages/profile/ProfileStats/ProfileStats";
import { AchievementsPanel } from "@/pages/profile/AchievementsPanel/AchievementsPanel";
import { ThisMonthPanel } from "@/pages/profile/ThisMonthPanel/ThisMonthPanel";
import { AppPreferencesPanel } from "@/pages/profile/AppPreferencesPanel/AppPreferencesPanel";
import { AccountSecurityPanel } from "@/pages/profile/AccountSecurityPanel/AccountSecurityPanel";
import { DangerZonePanel } from "@/pages/profile/DangerZonePanel/DangerZonePanel";
import "@/pages/profile/ProfilePage.scss";

export function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const { success, error: toastError } = useToast();
  const dateFormat = useDateFormat();

  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const [displayName, setDisplayName] = useState(user?.name ?? "You");
  const [bio, setBio] = useState("");

  const [editingName, setEditingName] = useState(false);
  const [editingBio, setEditingBio] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const data = await api.profile.get();
      setProfile(data);
      setBio(data.bio ?? "");
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveName(value: string) {
    try {
      const result = await api.auth.updateName({ name: value });
      await refreshUser();
      setDisplayName(result.name);
      setEditingName(false);
      success("Profile updated.");
    } catch {
      toastError("Couldn't update your name. Please try again.");
    }
  }

  async function saveBio(value: string) {
    try {
      const result = await api.profile.updateBio({ bio: value });
      setBio(result.bio ?? "");
      setEditingBio(false);
      success("Profile updated.");
    } catch {
      toastError("Couldn't update your bio. Please try again.");
    }
  }

  if (loading) {
    return (
      <section className="profile-page">
        <ProfileSkeleton />
      </section>
    );
  }

  if (loadFailed || !profile) {
    return (
      <section className="profile-page">
        <IllustratedErrorState onRetry={() => void load()} />
      </section>
    );
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
