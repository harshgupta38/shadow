import { useState, type FormEvent } from "react";
import {
  BoxArrowRight,
  GearFill,
  MoonStarsFill,
  PlusLg,
  Stars,
  SunFill,
} from "react-bootstrap-icons";

import {
  api,
  ApiError,
  type MemoryCategory,
  type ThemePreference,
} from "@/api";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { SectionCard } from "@/components/ui/SectionCard";
import { TextField } from "@/components/ui/TextField";
import { useAuth } from "@/context/AuthContext";
import { useLogoutConfirm } from "@/context/LogoutConfirmContext";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { useAsync } from "@/hooks/useAsync";
import { relativeTime } from "@/lib/format";
import { MEMORY_CATEGORY_LABEL, MEMORY_SOURCE_LABEL } from "@/lib/labels";

const CATEGORY_OPTIONS = Object.keys(MEMORY_CATEGORY_LABEL) as MemoryCategory[];

export function SettingsPage() {
  const { user, patchUser } = useAuth();
  const { requestLogout } = useLogoutConfirm();
  const { theme, setTheme } = useTheme();
  const toast = useToast();

  const [name, setName] = useState(user?.name ?? "");
  const [timezone, setTimezone] = useState(user?.timezone ?? "UTC");
  const [savingProfile, setSavingProfile] = useState(false);

  const memories = useAsync(() => api.profile.memories(), []);
  const [memoryCategory, setMemoryCategory] = useState<MemoryCategory>("other");
  const [memoryText, setMemoryText] = useState("");
  const [addingMemory, setAddingMemory] = useState(false);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setSavingProfile(true);
    try {
      const updated = await api.profile.update({ name: name.trim(), timezone: timezone.trim() });
      patchUser(updated);
      toast.success("Profile updated.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save your profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function chooseTheme(next: ThemePreference) {
    setTheme(next);
    try {
      const updated = await api.profile.update({ theme_preference: next });
      patchUser(updated);
    } catch {
      /* theme still applies locally */
    }
  }

  async function addMemory(event: FormEvent) {
    event.preventDefault();
    if (!memoryText.trim()) return;
    setAddingMemory(true);
    try {
      const entry = await api.profile.addMemory({
        category: memoryCategory,
        ai_understanding: memoryText.trim(),
        source: "manual",
      });
      memories.setData((prev) => [entry, ...(prev ?? [])]);
      setMemoryText("");
      toast.success("Jarvis will remember that.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save that memory.");
    } finally {
      setAddingMemory(false);
    }
  }

  const memoryList = memories.data ?? [];

  return (
    <div>
      <PageHeader title="Settings" subtitle="Your profile, appearance and what Jarvis knows." icon={<GearFill size={20} />} />

      <div className="row g-4">
        <div className="col-lg-6 d-flex flex-column gap-4">
          {/* Profile */}
          <SectionCard title="Profile">
            <div className="d-flex align-items-center gap-3 mb-4">
              <Avatar name={user?.name ?? "You"} size="lg" />
              <div>
                <div className="fw-bold">{user?.name}</div>
                <div className="text-muted-2 small">{user?.email}</div>
              </div>
            </div>
            <form onSubmit={saveProfile}>
              <TextField
                label="Name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <TextField
                label="Timezone"
                name="timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                hint="e.g. America/New_York, Europe/London"
              />
              <button className="btn btn-brand" disabled={savingProfile || !name.trim()}>
                {savingProfile ? "Saving…" : "Save changes"}
              </button>
            </form>
          </SectionCard>

          {/* Appearance */}
          <SectionCard title="Appearance" subtitle="Choose how Jarvis looks.">
            <div className="row g-3">
              {(
                [
                  { value: "light" as ThemePreference, label: "Light", icon: SunFill },
                  { value: "dark" as ThemePreference, label: "Dark", icon: MoonStarsFill },
                ]
              ).map((option) => {
                const Icon = option.icon;
                const active = theme === option.value;
                return (
                  <div className="col-6" key={option.value}>
                    <button
                      type="button"
                      className="surface-2 w-100 p-3 border-0 d-flex align-items-center gap-2 clickable"
                      style={{
                        outline: active ? "2px solid var(--jv-brand-1)" : "2px solid transparent",
                      }}
                      onClick={() => chooseTheme(option.value)}
                    >
                      <span className="stat-icon" style={{ width: 38, height: 38 }}>
                        <Icon size={17} />
                      </span>
                      <span className="fw-semibold">{option.label}</span>
                      {active && <span className="ms-auto pill pill-brand">Active</span>}
                    </button>
                  </div>
                );
              })}
            </div>
          </SectionCard>

          {/* Account */}
          <SectionCard title="Account">
            <div className="d-flex align-items-center justify-content-between">
              <div>
                <div className="fw-semibold">Sign out</div>
                <div className="text-muted-2 small">You'll need to sign in again.</div>
              </div>
              <button className="btn btn-outline-secondary" onClick={requestLogout}>
                <BoxArrowRight size={16} className="me-1" /> Sign out
              </button>
            </div>
          </SectionCard>
        </div>

        {/* Memory */}
        <div className="col-lg-6">
          <SectionCard
            title={
              <span className="d-inline-flex align-items-center gap-2">
                <Stars size={16} style={{ color: "var(--jv-brand-1)" }} /> What Jarvis knows
              </span>
            }
            subtitle="Understandings from onboarding, chats and your own notes."
          >
            <form onSubmit={addMemory} className="surface-2 p-3 mb-3">
              <div className="row g-2 align-items-end">
                <div className="col-sm-5">
                  <label htmlFor="mem-cat" className="form-label">
                    Category
                  </label>
                  <select
                    id="mem-cat"
                    className="form-select"
                    value={memoryCategory}
                    onChange={(e) => setMemoryCategory(e.target.value as MemoryCategory)}
                  >
                    {CATEGORY_OPTIONS.map((c) => (
                      <option value={c} key={c}>
                        {MEMORY_CATEGORY_LABEL[c]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-sm-7">
                  <label htmlFor="mem-text" className="form-label">
                    Something to remember
                  </label>
                  <input
                    id="mem-text"
                    className="form-control"
                    placeholder="e.g. I focus best early mornings"
                    value={memoryText}
                    onChange={(e) => setMemoryText(e.target.value)}
                  />
                </div>
              </div>
              <div className="text-end mt-2">
                <button className="btn btn-soft btn-sm" disabled={addingMemory || !memoryText.trim()}>
                  <PlusLg size={14} className="me-1" /> Add
                </button>
              </div>
            </form>

            {memories.loading && <LoadingState label="Loading memory…" full={false} />}

            {!memories.loading && memoryList.length === 0 && (
              <EmptyState
                compact
                icon={<Stars size={22} />}
                title="Nothing remembered yet"
                message="Complete onboarding or add a note to help Jarvis personalise its guidance."
              />
            )}

            {!memories.loading && memoryList.length > 0 && (
              <div className="d-flex flex-column gap-2" style={{ maxHeight: 460, overflowY: "auto" }}>
                {memoryList.map((memory) => (
                  <div className="surface-2 p-3" key={memory.id}>
                    <div className="d-flex align-items-center gap-2 mb-2">
                      <Pill variant="brand">{MEMORY_CATEGORY_LABEL[memory.category]}</Pill>
                      <Pill>{MEMORY_SOURCE_LABEL[memory.source]}</Pill>
                      <span className="text-faint ms-auto" style={{ fontSize: "0.72rem" }}>
                        {relativeTime(memory.created_at)}
                      </span>
                    </div>
                    <p className="mb-0 small" style={{ lineHeight: 1.55 }}>
                      {memory.ai_understanding}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
