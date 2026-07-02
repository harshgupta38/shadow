import { useEffect, useState, type FormEvent } from "react";
import {
  BriefcaseFill,
  ExclamationTriangleFill,
  PersonBadgeFill,
  ShieldCheck,
  Stars,
} from "react-bootstrap-icons";
import { useNavigate } from "react-router-dom";

import { api, ApiError, type AIProfileUpdate, type BasicProfileUpdate } from "@/api";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { SectionCard } from "@/components/ui/SectionCard";
import { TextField } from "@/components/ui/TextField";
import { useAuth } from "@/context/AuthContext";
import { useLogoutConfirm } from "@/context/LogoutConfirmContext";
import { useToast } from "@/context/ToastContext";
import { useAsync } from "@/hooks/useAsync";
import { formatDate, relativeTime } from "@/lib/format";

const INDIA_TIMEZONE = "Asia/Kolkata";

export function ProfilePage() {
  const { patchUser } = useAuth();
  const toast = useToast();
  const { requestLogout } = useLogoutConfirm();
  const navigate = useNavigate();

  const basicQuery = useAsync(() => api.profile.basic(), []);
  const aiQuery = useAsync(() => api.profile.ai(), []);

  const [basicDraft, setBasicDraft] = useState<BasicProfileUpdate>({});
  const [aiDraft, setAiDraft] = useState<AIProfileUpdate>({});

  const [savingBasic, setSavingBasic] = useState(false);
  const [savingAi, setSavingAi] = useState(false);

  useEffect(() => {
    if (!basicQuery.data) return;
    setBasicDraft({
      name: basicQuery.data.name,
      timezone: INDIA_TIMEZONE,
      display_name: basicQuery.data.display_name,
      profile_picture_url: basicQuery.data.profile_picture_url,
      current_role: basicQuery.data.current_role,
      current_goal: basicQuery.data.current_goal,
      short_bio: basicQuery.data.short_bio,
    });
  }, [basicQuery.data]);

  useEffect(() => {
    if (!aiQuery.data) return;
    setAiDraft({
      profession: aiQuery.data.profession,
      industry: aiQuery.data.industry,
      experience_summary: aiQuery.data.experience_summary,
      primary_tech_stack: aiQuery.data.primary_tech_stack,
      current_company: aiQuery.data.current_company,
      dream_company: aiQuery.data.dream_company,
      interview_preparation_status: aiQuery.data.interview_preparation_status,
      long_term_vision: aiQuery.data.long_term_vision,
      current_goals_overview: aiQuery.data.current_goals_overview,
      daily_routine: aiQuery.data.daily_routine,
      working_style: aiQuery.data.working_style,
      learning_profile: aiQuery.data.learning_profile,
      productivity_preferences: aiQuery.data.productivity_preferences,
      motivation: aiQuery.data.motivation,
      always_remember: aiQuery.data.always_remember,
    });
  }, [aiQuery.data]);

  async function saveBasic(event: FormEvent) {
    event.preventDefault();
    setSavingBasic(true);
    try {
      const updated = await api.profile.updateBasic({
        ...basicDraft,
        timezone: INDIA_TIMEZONE,
      });
      basicQuery.setData(updated);
      patchUser({ name: updated.name, timezone: INDIA_TIMEZONE });
      toast.success("Basic profile updated.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save profile details.");
    } finally {
      setSavingBasic(false);
    }
  }

  async function saveAIProfile(event: FormEvent) {
    event.preventDefault();
    setSavingAi(true);
    try {
      const updated = await api.profile.updateAi(aiDraft);
      aiQuery.setData(updated);
      toast.success("AI profile updated.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save AI profile.");
    } finally {
      setSavingAi(false);
    }
  }

  const loading = basicQuery.loading || aiQuery.loading;
  const pageError = basicQuery.error || aiQuery.error;

  if (loading) return <LoadingState label="Loading profile..." />;

  if (pageError || !basicQuery.data || !aiQuery.data) {
    return (
      <EmptyState
        title="Couldn't load your profile"
        message={pageError ?? "Please try again."}
        action={
          <button
            className="btn btn-brand"
            onClick={() => {
              basicQuery.reload();
              aiQuery.reload();
            }}
          >
            Retry
          </button>
        }
      />
    );
  }

  const profile = basicQuery.data;
  const ai = aiQuery.data;

  return (
    <div className="profile-page">
      <PageHeader
        title="Profile"
        subtitle="Who you are and what Shadow understands about you."
        icon={<PersonBadgeFill size={20} />}
      />

      <div className="row g-4 mb-4">
        <div className="col-12">
          <section className="surface profile-hero p-4 p-sm-5">
            <div className="d-flex flex-column flex-lg-row align-items-lg-center gap-4">
              <Avatar name={profile.display_name ?? profile.name} size="lg" gradient={["#7c6cff", "#4f8bff"]} />
              <div className="flex-grow-1 min-w-0">
                <div className="d-flex align-items-center gap-2 flex-wrap mb-2">
                  <h2 className="h3 fw-bold mb-0 text-truncate">{profile.display_name || profile.name}</h2>
                  <Pill variant="brand">Member</Pill>
                </div>
                <p className="text-muted-2 mb-1">{profile.current_role || "Role not set"}</p>
                <p className="mb-0 text-faint">
                  {profile.current_goal || "Set a current goal to personalise planning"}
                </p>
              </div>
              <div className="text-lg-end">
                <div className="small text-faint mb-1">Member Since</div>
                <div className="fw-semibold">{formatDate(profile.member_since)}</div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <div className="row g-4">
        <div className="col-xl-7 d-flex flex-column gap-4">
          <SectionCard title="Basic Profile" subtitle="Identity details used across Shadow.">
            <form onSubmit={saveBasic}>
              <div className="row g-3">
                <div className="col-sm-6">
                  <TextField
                    label="Full Name"
                    value={basicDraft.name ?? ""}
                    onChange={(e) => setBasicDraft((p) => ({ ...p, name: e.target.value }))}
                    required
                  />
                </div>
                <div className="col-sm-6">
                  <TextField
                    label="Display Name"
                    value={basicDraft.display_name ?? ""}
                    onChange={(e) =>
                      setBasicDraft((p) => ({
                        ...p,
                        display_name: e.target.value || null,
                      }))
                    }
                    hint="How Shadow should address you"
                  />
                </div>
                <div className="col-sm-6">
                  <TextField
                    label="Current Role"
                    value={basicDraft.current_role ?? ""}
                    onChange={(e) =>
                      setBasicDraft((p) => ({
                        ...p,
                        current_role: e.target.value || null,
                      }))
                    }
                  />
                </div>
                <div className="col-sm-6">
                  <TextField
                    label="Current Goal"
                    value={basicDraft.current_goal ?? ""}
                    onChange={(e) =>
                      setBasicDraft((p) => ({
                        ...p,
                        current_goal: e.target.value || null,
                      }))
                    }
                  />
                </div>
                <div className="col-12">
                  <label className="form-label">Short Bio</label>
                  <textarea
                    className="form-control"
                    rows={3}
                    maxLength={500}
                    value={basicDraft.short_bio ?? ""}
                    onChange={(e) =>
                      setBasicDraft((p) => ({
                        ...p,
                        short_bio: e.target.value || null,
                      }))
                    }
                  />
                </div>
              </div>
              <div className="mt-3">
                <button className="btn btn-brand" disabled={savingBasic}>
                  {savingBasic ? "Saving..." : "Save Basic Profile"}
                </button>
              </div>
            </form>
          </SectionCard>

          <SectionCard
            title={
              <span className="d-inline-flex align-items-center gap-2">
                <Stars size={16} style={{ color: "var(--jv-brand-1)" }} /> AI Profile
              </span>
            }
            subtitle={`Version ${ai.profile_version} · updated ${relativeTime(ai.updated_at)}`}
          >
            <form onSubmit={saveAIProfile} className="d-flex flex-column gap-3">
              <div className="row g-3">
                <div className="col-md-6">
                  <TextField
                    label="Profession"
                    value={aiDraft.profession ?? ""}
                    onChange={(e) =>
                      setAiDraft((p) => ({ ...p, profession: e.target.value || null }))
                    }
                  />
                </div>
                <div className="col-md-6">
                  <TextField
                    label="Industry"
                    value={aiDraft.industry ?? ""}
                    onChange={(e) => setAiDraft((p) => ({ ...p, industry: e.target.value || null }))}
                  />
                </div>
                <div className="col-md-6">
                  <TextField
                    label="Current Company"
                    value={aiDraft.current_company ?? ""}
                    onChange={(e) =>
                      setAiDraft((p) => ({ ...p, current_company: e.target.value || null }))
                    }
                  />
                </div>
                <div className="col-md-6">
                  <TextField
                    label="Dream Company"
                    value={aiDraft.dream_company ?? ""}
                    onChange={(e) =>
                      setAiDraft((p) => ({ ...p, dream_company: e.target.value || null }))
                    }
                  />
                </div>
                <div className="col-12">
                  <TextField
                    label="Primary Tech Stack"
                    value={aiDraft.primary_tech_stack ?? ""}
                    onChange={(e) =>
                      setAiDraft((p) => ({ ...p, primary_tech_stack: e.target.value || null }))
                    }
                  />
                </div>
                <div className="col-12">
                  <label className="form-label">Long-Term Vision</label>
                  <textarea
                    className="form-control"
                    rows={2}
                    value={aiDraft.long_term_vision ?? ""}
                    onChange={(e) =>
                      setAiDraft((p) => ({
                        ...p,
                        long_term_vision: e.target.value || null,
                      }))
                    }
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label">Working Style</label>
                  <textarea
                    className="form-control"
                    rows={2}
                    value={aiDraft.working_style ?? ""}
                    onChange={(e) =>
                      setAiDraft((p) => ({ ...p, working_style: e.target.value || null }))
                    }
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label">Productivity Preferences</label>
                  <textarea
                    className="form-control"
                    rows={2}
                    value={aiDraft.productivity_preferences ?? ""}
                    onChange={(e) =>
                      setAiDraft((p) => ({
                        ...p,
                        productivity_preferences: e.target.value || null,
                      }))
                    }
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label">Motivation</label>
                  <textarea
                    className="form-control"
                    rows={2}
                    value={aiDraft.motivation ?? ""}
                    onChange={(e) => setAiDraft((p) => ({ ...p, motivation: e.target.value || null }))}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label">Always Remember</label>
                  <textarea
                    className="form-control"
                    rows={2}
                    value={aiDraft.always_remember ?? ""}
                    onChange={(e) =>
                      setAiDraft((p) => ({ ...p, always_remember: e.target.value || null }))
                    }
                  />
                </div>
              </div>

              <div>
                <button className="btn btn-brand" disabled={savingAi}>
                  {savingAi ? "Saving..." : "Save AI Profile"}
                </button>
              </div>
            </form>
          </SectionCard>
        </div>

        <div className="col-xl-5 d-flex flex-column gap-4">
          <SectionCard
            title={
              <span className="d-inline-flex align-items-center gap-2">
                <Stars size={16} style={{ color: "var(--jv-brand-1)" }} /> AI Memory Center
              </span>
            }
            subtitle="Moved to a dedicated page with the same card-based editor."
          >
            <div className="surface-2 p-3 d-flex flex-column gap-2">
              <div className="text-muted-2 small">
                Manage memory entries in one focused place while keeping this profile page clean.
              </div>
              <div>
                <button className="btn btn-soft" onClick={() => navigate("/memory-center")}>
                  Open AI Memory Center
                </button>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Account Security" subtitle="Authentication and account access status.">
            <div className="d-flex flex-column gap-3">
              <div className="surface-2 p-3 d-flex align-items-start gap-3">
                <ShieldCheck size={18} style={{ color: "var(--jv-success)", marginTop: 2 }} />
                <div>
                  <div className="fw-semibold">Email + Password Authentication</div>
                  <div className="small text-muted-2">
                    Password change and 2FA are planned for upcoming sprints.
                  </div>
                </div>
              </div>
              <div className="surface-2 p-3">
                <div className="small text-faint mb-1">Email</div>
                <div className="fw-semibold">{profile.email}</div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Danger Zone" subtitle="Destructive account actions.">
            <div className="surface-2 p-3 border border-danger-subtle">
              <div className="d-flex align-items-start gap-2 mb-2 text-danger">
                <ExclamationTriangleFill size={16} style={{ marginTop: 2 }} />
                <div className="fw-semibold">Delete Account (Coming Soon)</div>
              </div>
              <p className="small text-muted-2 mb-3">
                Account deletion/export flows are intentionally isolated and require strong confirmation.
              </p>
              <button className="btn btn-outline-secondary" onClick={requestLogout}>
                <BriefcaseFill size={14} className="me-1" /> Sign out instead
              </button>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
