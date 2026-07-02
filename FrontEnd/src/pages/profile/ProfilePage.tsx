import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  Eye,
  EyeSlash,
  LockFill,
  PersonFill,
  PlusLg,
  ShieldLockFill,
  Stars,
  TrashFill,
} from "react-bootstrap-icons";

import { api, ApiError, type MemoryCategory } from "@/api";
import { Avatar } from "@/components/ui/Avatar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { SectionCard } from "@/components/ui/SectionCard";
import { TextField } from "@/components/ui/TextField";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { useAsync } from "@/hooks/useAsync";
import { relativeTime } from "@/lib/format";
import { MEMORY_CATEGORY_LABEL, MEMORY_SOURCE_LABEL } from "@/lib/labels";

const CATEGORY_OPTIONS = Object.keys(MEMORY_CATEGORY_LABEL) as MemoryCategory[];

export function ProfilePage() {
  const { user, patchUser, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  // ── Profile details ──────────────────────────────────────────────────────
  const [name, setName] = useState(user?.name ?? "");
  const [timezone, setTimezone] = useState(user?.timezone ?? "UTC");
  const [savingProfile, setSavingProfile] = useState(false);

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

  // ── Password ─────────────────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [changingPw, setChangingPw] = useState(false);

  const passwordValid =
    currentPassword.length > 0 && newPassword.length >= 8 && confirmPassword.length > 0;

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setPwError(null);
    if (newPassword !== confirmPassword) {
      setPwError("New passwords do not match.");
      return;
    }
    setChangingPw(true);
    try {
      await api.profile.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password updated.");
    } catch (err) {
      setPwError(err instanceof ApiError ? err.message : "Couldn't update your password.");
    } finally {
      setChangingPw(false);
    }
  }

  const passwordToggle = (
    <button
      type="button"
      className="btn btn-ghost btn-icon"
      style={{ width: 34, height: 34 }}
      onClick={() => setShowPasswords((v) => !v)}
      aria-label={showPasswords ? "Hide passwords" : "Show passwords"}
      tabIndex={-1}
    >
      {showPasswords ? <EyeSlash size={16} /> : <Eye size={16} />}
    </button>
  );

  // ── Memory ───────────────────────────────────────────────────────────────
  const memories = useAsync(() => api.profile.memories(), []);
  const [memoryCategory, setMemoryCategory] = useState<MemoryCategory>("other");
  const [memoryText, setMemoryText] = useState("");
  const [addingMemory, setAddingMemory] = useState(false);
  const memoryList = memories.data ?? [];

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
      toast.success("Shadow will remember that.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save that memory.");
    } finally {
      setAddingMemory(false);
    }
  }

  // ── Delete account ───────────────────────────────────────────────────────
  const [deletePassword, setDeletePassword] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    setDeleting(true);
    try {
      await api.profile.deleteAccount(deletePassword);
      setShowDeleteConfirm(false);
      logout();
      navigate("/login", { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't delete your account.");
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Profile"
        subtitle="Your details, security and what Shadow knows about you."
        icon={<PersonFill size={20} />}
      />

      <div className="row g-4">
        <div className="col-lg-6 d-flex flex-column gap-4">
          {/* Profile details */}
          <SectionCard title="Your details">
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

          {/* Security */}
          <SectionCard
            title={
              <span className="d-inline-flex align-items-center gap-2">
                <ShieldLockFill size={16} style={{ color: "var(--jv-brand-1)" }} /> Password
              </span>
            }
            subtitle="Use a strong password you don't reuse elsewhere."
          >
            <form onSubmit={changePassword}>
              <TextField
                label="Current password"
                name="current_password"
                type={showPasswords ? "text" : "password"}
                autoComplete="current-password"
                icon={<LockFill size={15} />}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                trailing={passwordToggle}
                required
              />
              <TextField
                label="New password"
                name="new_password"
                type={showPasswords ? "text" : "password"}
                autoComplete="new-password"
                icon={<LockFill size={15} />}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                hint="At least 8 characters."
                required
              />
              <TextField
                label="Confirm new password"
                name="confirm_password"
                type={showPasswords ? "text" : "password"}
                autoComplete="new-password"
                icon={<LockFill size={15} />}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                error={pwError}
                required
              />
              <button className="btn btn-brand" disabled={changingPw || !passwordValid}>
                {changingPw ? "Updating…" : "Update password"}
              </button>
            </form>
          </SectionCard>
        </div>

        <div className="col-lg-6 d-flex flex-column gap-4">
          {/* Memory */}
          <SectionCard
            title={
              <span className="d-inline-flex align-items-center gap-2">
                <Stars size={16} style={{ color: "var(--jv-brand-1)" }} /> What Shadow knows
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
                message="Complete onboarding or add a note to help Shadow personalise its guidance."
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

          {/* Danger zone */}
          <SectionCard
            title={
              <span className="d-inline-flex align-items-center gap-2 text-danger">
                <TrashFill size={16} /> Danger zone
              </span>
            }
            subtitle="Permanently delete your account and all associated data."
          >
            <p className="text-muted-2 small mb-3">
              This removes your goals, metrics, journal entries, chats and memory. This action
              cannot be undone. Enter your password to confirm.
            </p>
            <TextField
              label="Password"
              name="delete_password"
              type="password"
              autoComplete="current-password"
              icon={<LockFill size={15} />}
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder="Your password"
            />
            <button
              type="button"
              className="btn btn-danger"
              disabled={!deletePassword}
              onClick={() => setShowDeleteConfirm(true)}
            >
              <TrashFill size={15} className="me-1" /> Delete account
            </button>
          </SectionCard>
        </div>
      </div>

      <ConfirmDialog
        show={showDeleteConfirm}
        destructive
        busy={deleting}
        title="Delete your account?"
        message="All of your data will be permanently erased. This cannot be undone."
        confirmLabel="Delete forever"
        cancelLabel="Keep my account"
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
