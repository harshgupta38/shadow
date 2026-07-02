import { useEffect, useState, type FormEvent } from "react";
import {
  BellFill,
  CalendarWeek,
  ChatSquareTextFill,
  GearFill,
  Globe,
  MoonStarsFill,
  Palette2,
  SunFill,
} from "react-bootstrap-icons";

import {
  api,
  ApiError,
  type AIResponseLength,
  type AIPersonality,
  type DateFormat,
  type SettingsRead,
  type ThemePreference,
  type TimeFormat,
  type WeekStartsOn,
} from "@/api";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { SectionCard } from "@/components/ui/SectionCard";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { useAsync } from "@/hooks/useAsync";
import { formatMinutes } from "@/lib/format";

type SaveKey = "appearance" | "notifications" | "ai" | "planner" | "privacy";

const RESPONSE_LENGTH_OPTIONS: Array<{ value: AIResponseLength; label: string }> = [
  { value: "short", label: "Short" },
  { value: "balanced", label: "Balanced" },
  { value: "detailed", label: "Detailed" },
  { value: "very_detailed", label: "Very detailed" },
];

const PERSONALITY_OPTIONS: Array<{ value: AIPersonality; label: string }> = [
  { value: "professional", label: "Professional" },
  { value: "friendly", label: "Friendly" },
  { value: "coach", label: "Coach" },
  { value: "teacher", label: "Teacher" },
  { value: "mentor", label: "Mentor" },
  { value: "minimal", label: "Minimal" },
];

const WEEK_START_OPTIONS: Array<{ value: WeekStartsOn; label: string }> = [
  { value: "monday", label: "Monday" },
  { value: "sunday", label: "Sunday" },
];

const TIME_FORMAT_OPTIONS: Array<{ value: TimeFormat; label: string }> = [
  { value: "12h", label: "12-hour" },
  { value: "24h", label: "24-hour" },
];

const DATE_FORMAT_OPTIONS: Array<{ value: DateFormat; label: string }> = [
  { value: "dd/mm/yyyy", label: "DD/MM/YYYY" },
  { value: "mm/dd/yyyy", label: "MM/DD/YYYY" },
  { value: "yyyy-mm-dd", label: "YYYY-MM-DD" },
];

interface ToggleRowProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function ToggleRow({ id, label, description, checked, onChange }: ToggleRowProps) {
  return (
    <div className="d-flex align-items-start justify-content-between gap-3 surface-2 p-3">
      <div>
        <label className="fw-semibold d-block mb-1" htmlFor={id}>
          {label}
        </label>
        <div className="text-muted-2 small">{description}</div>
      </div>
      <div className="form-check form-switch m-0 pt-1">
        <input
          id={id}
          className="form-check-input"
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
      </div>
    </div>
  );
}

export function SettingsPage() {
  const { patchUser } = useAuth();
  const { setTheme } = useTheme();
  const toast = useToast();

  const settingsQuery = useAsync(() => api.settings.get(), []);
  const [draft, setDraft] = useState<SettingsRead | null>(null);
  const [saving, setSaving] = useState<Record<SaveKey, boolean>>({
    appearance: false,
    notifications: false,
    ai: false,
    planner: false,
    privacy: false,
  });

  useEffect(() => {
    if (settingsQuery.data) setDraft(settingsQuery.data);
  }, [settingsQuery.data]);

  function setSavingState(key: SaveKey, value: boolean) {
    setSaving((prev) => ({ ...prev, [key]: value }));
  }

  function applyUpdated(updated: SettingsRead) {
    settingsQuery.setData(updated);
    setDraft(updated);
    setTheme(updated.appearance.theme_preference);
    patchUser({ theme_preference: updated.appearance.theme_preference });
  }

  async function saveAppearance(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setSavingState("appearance", true);
    try {
      const updated = await api.settings.updateAppearance({
        theme_preference: draft.appearance.theme_preference,
      });
      applyUpdated(updated);
      toast.success("Appearance settings updated.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update appearance settings.");
    } finally {
      setSavingState("appearance", false);
    }
  }

  async function saveNotifications(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setSavingState("notifications", true);
    try {
      const updated = await api.settings.updateNotifications(draft.notifications);
      applyUpdated(updated);
      toast.success("Notification settings updated.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update notifications.");
    } finally {
      setSavingState("notifications", false);
    }
  }

  async function saveAIBehavior(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setSavingState("ai", true);
    try {
      const updated = await api.settings.updateAIBehavior(draft.ai_behavior);
      applyUpdated(updated);
      toast.success("AI behavior updated.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update AI behavior.");
    } finally {
      setSavingState("ai", false);
    }
  }

  async function savePlanner(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setSavingState("planner", true);
    try {
      const updated = await api.settings.updatePlanner(draft.planner);
      applyUpdated(updated);
      toast.success("Planner defaults updated.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update planner defaults.");
    } finally {
      setSavingState("planner", false);
    }
  }

  async function savePrivacy(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setSavingState("privacy", true);
    try {
      const updated = await api.settings.updatePrivacy(draft.privacy);
      applyUpdated(updated);
      toast.success("Privacy settings updated.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update privacy settings.");
    } finally {
      setSavingState("privacy", false);
    }
  }

  function chooseTheme(next: ThemePreference) {
    setTheme(next);
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            appearance: { ...prev.appearance, theme_preference: next },
          }
        : prev,
    );
  }

  if (settingsQuery.loading) {
    return <LoadingState label="Loading settings..." />;
  }

  if (settingsQuery.error) {
    return (
      <EmptyState
        title="Couldn't load settings"
        message={settingsQuery.error}
        action={
          <button className="btn btn-brand" onClick={settingsQuery.reload}>
            Retry
          </button>
        }
      />
    );
  }

  if (!draft) {
    return <LoadingState label="Loading settings..." />;
  }

  return (
    <div className="settings-page">
      <PageHeader
        title="Settings"
        subtitle="How Shadow behaves, reminds and formats your workflow."
        icon={<GearFill size={20} />}
      />

      <section className="surface settings-hero p-4 p-sm-5 mb-4">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-3">
          <div>
            <h2 className="h4 fw-bold mb-1">Behavior Controls</h2>
            <p className="text-muted-2 mb-0">
              Settings change Shadow's response style, reminders and planning defaults.
            </p>
          </div>
          <div className="d-flex flex-wrap gap-2">
            <Pill variant="brand">{draft.ai_behavior.ai_personality}</Pill>
            <Pill variant="info">{draft.planner.time_format}</Pill>
            <Pill variant={draft.privacy.ai_memory_enabled ? "success" : "warn"}>
              Memory {draft.privacy.ai_memory_enabled ? "On" : "Off"}
            </Pill>
          </div>
        </div>
      </section>

      <div className="row g-4">
        <div className="col-xl-6 d-flex flex-column gap-4">
          <SectionCard
            title={
              <span className="d-inline-flex align-items-center gap-2">
                <Palette2 size={16} /> Appearance
              </span>
            }
            subtitle="Choose how your Shadow workspace looks."
          >
            <form onSubmit={saveAppearance}>
              <div className="row g-3">
                {[
                  { value: "light" as ThemePreference, label: "Light", icon: SunFill },
                  { value: "dark" as ThemePreference, label: "Dark", icon: MoonStarsFill },
                ].map((option) => {
                  const Icon = option.icon;
                  const active = draft.appearance.theme_preference === option.value;
                  return (
                    <div className="col-6" key={option.value}>
                      <button
                        type="button"
                        className="surface-2 w-100 p-3 border-0 d-flex align-items-center gap-2 clickable setting-grid-option"
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
              <div className="mt-3">
                <button className="btn btn-brand" disabled={saving.appearance}>
                  {saving.appearance ? "Saving..." : "Save Appearance"}
                </button>
              </div>
            </form>
          </SectionCard>

          <SectionCard
            title={
              <span className="d-inline-flex align-items-center gap-2">
                <BellFill size={15} /> Notifications
              </span>
            }
            subtitle="Control reminders and daily brief behavior."
          >
            <form onSubmit={saveNotifications} className="d-flex flex-column gap-2">
              <ToggleRow
                id="notify-enabled"
                label="Enable notifications"
                description="Master switch for all app notifications."
                checked={draft.notifications.notifications_enabled}
                onChange={(checked) =>
                  setDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          notifications: { ...prev.notifications, notifications_enabled: checked },
                        }
                      : prev,
                  )
                }
              />
              <ToggleRow
                id="notify-push"
                label="Push notifications"
                description="Get browser push notifications when enabled in your device."
                checked={draft.notifications.push_notifications_enabled}
                onChange={(checked) =>
                  setDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          notifications: { ...prev.notifications, push_notifications_enabled: checked },
                        }
                      : prev,
                  )
                }
              />
              <ToggleRow
                id="notify-email"
                label="Email notifications"
                description="Receive reminder emails for important planning events."
                checked={draft.notifications.email_notifications_enabled}
                onChange={(checked) =>
                  setDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          notifications: { ...prev.notifications, email_notifications_enabled: checked },
                        }
                      : prev,
                  )
                }
              />
              <ToggleRow
                id="notify-reminder"
                label="Task reminders"
                description="Enable reminder notifications for upcoming planned tasks."
                checked={draft.notifications.reminder_notifications_enabled}
                onChange={(checked) =>
                  setDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          notifications: {
                            ...prev.notifications,
                            reminder_notifications_enabled: checked,
                          },
                        }
                      : prev,
                  )
                }
              />
              <ToggleRow
                id="notify-brief"
                label="Daily brief"
                description="Get a daily summary from Shadow with priority suggestions."
                checked={draft.notifications.daily_brief_enabled}
                onChange={(checked) =>
                  setDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          notifications: { ...prev.notifications, daily_brief_enabled: checked },
                        }
                      : prev,
                  )
                }
              />

              <div className="surface-2 p-3">
                <label className="form-label" htmlFor="daily-brief-time">
                  Daily brief time
                </label>
                <input
                  id="daily-brief-time"
                  type="time"
                  className="form-control"
                  value={draft.notifications.daily_brief_time}
                  onChange={(e) =>
                    setDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            notifications: {
                              ...prev.notifications,
                              daily_brief_time: e.target.value,
                            },
                          }
                        : prev,
                    )
                  }
                />
              </div>

              <div className="mt-2">
                <button className="btn btn-brand" disabled={saving.notifications}>
                  {saving.notifications ? "Saving..." : "Save Notifications"}
                </button>
              </div>
            </form>
          </SectionCard>

          <SectionCard
            title={
              <span className="d-inline-flex align-items-center gap-2">
                <Globe size={16} /> Privacy
              </span>
            }
            subtitle="Control analytics and memory usage."
          >
            <form onSubmit={savePrivacy} className="d-flex flex-column gap-2">
              <ToggleRow
                id="privacy-analytics"
                label="Opt out of analytics"
                description="Disable anonymous analytics used to improve product quality."
                checked={draft.privacy.analytics_opt_out}
                onChange={(checked) =>
                  setDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          privacy: { ...prev.privacy, analytics_opt_out: checked },
                        }
                      : prev,
                  )
                }
              />
              <ToggleRow
                id="privacy-memory"
                label="Allow AI memory"
                description="When disabled, Shadow ignores long-term memory for responses."
                checked={draft.privacy.ai_memory_enabled}
                onChange={(checked) =>
                  setDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          privacy: { ...prev.privacy, ai_memory_enabled: checked },
                        }
                      : prev,
                  )
                }
              />
              <div className="small text-muted-2 surface-2 p-3">
                Turning off AI memory does not delete saved memories. It only controls whether they are used
                in AI context assembly.
              </div>
              <div className="mt-2">
                <button className="btn btn-brand" disabled={saving.privacy}>
                  {saving.privacy ? "Saving..." : "Save Privacy"}
                </button>
              </div>
            </form>
          </SectionCard>
        </div>

        <div className="col-xl-6 d-flex flex-column gap-4">
          <SectionCard
            title={
              <span className="d-inline-flex align-items-center gap-2">
                <ChatSquareTextFill size={16} /> AI Behavior
              </span>
            }
            subtitle="Tune response style and suggestion behavior."
          >
            <form onSubmit={saveAIBehavior} className="d-flex flex-column gap-3">
              <div className="surface-2 p-3">
                <label className="form-label" htmlFor="ai-response-length">
                  Response length
                </label>
                <select
                  id="ai-response-length"
                  className="form-select"
                  value={draft.ai_behavior.ai_response_length}
                  onChange={(e) =>
                    setDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            ai_behavior: {
                              ...prev.ai_behavior,
                              ai_response_length: e.target.value as AIResponseLength,
                            },
                          }
                        : prev,
                    )
                  }
                >
                  {RESPONSE_LENGTH_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="surface-2 p-3">
                <label className="form-label" htmlFor="ai-personality">
                  Personality
                </label>
                <select
                  id="ai-personality"
                  className="form-select"
                  value={draft.ai_behavior.ai_personality}
                  onChange={(e) =>
                    setDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            ai_behavior: {
                              ...prev.ai_behavior,
                              ai_personality: e.target.value as AIPersonality,
                            },
                          }
                        : prev,
                    )
                  }
                >
                  {PERSONALITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <ToggleRow
                id="ai-suggestions"
                label="AI suggestions"
                description="Allow Shadow to suggest next actions proactively across pages."
                checked={draft.ai_behavior.ai_suggestions_enabled}
                onChange={(checked) =>
                  setDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          ai_behavior: { ...prev.ai_behavior, ai_suggestions_enabled: checked },
                        }
                      : prev,
                  )
                }
              />
              <ToggleRow
                id="smart-planning"
                label="Smart planning"
                description="Use AI to prioritize and shape your daily plan automatically."
                checked={draft.ai_behavior.smart_planning_enabled}
                onChange={(checked) =>
                  setDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          ai_behavior: { ...prev.ai_behavior, smart_planning_enabled: checked },
                        }
                      : prev,
                  )
                }
              />

              <div>
                <button className="btn btn-brand" disabled={saving.ai}>
                  {saving.ai ? "Saving..." : "Save AI Behavior"}
                </button>
              </div>
            </form>
          </SectionCard>

          <SectionCard
            title={
              <span className="d-inline-flex align-items-center gap-2">
                <CalendarWeek size={16} /> Planner Defaults
              </span>
            }
            subtitle="Formatting and default timing for planning flows."
          >
            <form onSubmit={savePlanner} className="d-flex flex-column gap-3">
              <div className="row g-3">
                <div className="col-sm-6">
                  <div className="surface-2 p-3">
                    <label className="form-label" htmlFor="week-starts-on">
                      Week starts on
                    </label>
                    <select
                      id="week-starts-on"
                      className="form-select"
                      value={draft.planner.week_starts_on}
                      onChange={(e) =>
                        setDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                planner: {
                                  ...prev.planner,
                                  week_starts_on: e.target.value as WeekStartsOn,
                                },
                              }
                            : prev,
                        )
                      }
                    >
                      {WEEK_START_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="col-sm-6">
                  <div className="surface-2 p-3">
                    <label className="form-label" htmlFor="default-reminder-time">
                      Default reminder
                    </label>
                    <input
                      id="default-reminder-time"
                      type="time"
                      className="form-control"
                      value={draft.planner.default_reminder_time}
                      onChange={(e) =>
                        setDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                planner: {
                                  ...prev.planner,
                                  default_reminder_time: e.target.value,
                                },
                              }
                            : prev,
                        )
                      }
                    />
                  </div>
                </div>

                <div className="col-sm-6">
                  <div className="surface-2 p-3">
                    <label className="form-label" htmlFor="default-duration">
                      Default task duration (minutes)
                    </label>
                    <input
                      id="default-duration"
                      type="number"
                      min={5}
                      max={360}
                      step={5}
                      className="form-control"
                      value={draft.planner.default_task_duration_minutes}
                      onChange={(e) =>
                        setDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                planner: {
                                  ...prev.planner,
                                  default_task_duration_minutes: Number(e.target.value || 0),
                                },
                              }
                            : prev,
                        )
                      }
                    />
                    <div className="form-text">
                      {formatMinutes(draft.planner.default_task_duration_minutes)} per task by default
                    </div>
                  </div>
                </div>

                <div className="col-sm-6">
                  <div className="surface-2 p-3">
                    <label className="form-label" htmlFor="time-format">
                      Time format
                    </label>
                    <select
                      id="time-format"
                      className="form-select"
                      value={draft.planner.time_format}
                      onChange={(e) =>
                        setDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                planner: {
                                  ...prev.planner,
                                  time_format: e.target.value as TimeFormat,
                                },
                              }
                            : prev,
                        )
                      }
                    >
                      {TIME_FORMAT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="col-sm-6">
                  <div className="surface-2 p-3">
                    <label className="form-label" htmlFor="date-format">
                      Date format
                    </label>
                    <select
                      id="date-format"
                      className="form-select"
                      value={draft.planner.date_format}
                      onChange={(e) =>
                        setDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                planner: {
                                  ...prev.planner,
                                  date_format: e.target.value as DateFormat,
                                },
                              }
                            : prev,
                        )
                      }
                    >
                      {DATE_FORMAT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <button className="btn btn-brand" disabled={saving.planner}>
                  {saving.planner ? "Saving..." : "Save Planner Defaults"}
                </button>
              </div>
            </form>
          </SectionCard>

          <SectionCard title="Current Snapshot" subtitle="Quick view of active behavior config.">
            <div className="d-flex flex-column gap-2">
              <div className="surface-2 p-3 d-flex align-items-center justify-content-between gap-2">
                <span className="fw-semibold">Response style</span>
                <div className="d-flex gap-2 flex-wrap justify-content-end">
                  <Pill variant="brand">{draft.ai_behavior.ai_personality}</Pill>
                  <Pill>{draft.ai_behavior.ai_response_length.replace("_", " ")}</Pill>
                </div>
              </div>
              <div className="surface-2 p-3 d-flex align-items-center justify-content-between gap-2">
                <span className="fw-semibold">Planner</span>
                <div className="d-flex gap-2 flex-wrap justify-content-end">
                  <Pill>{draft.planner.week_starts_on}</Pill>
                  <Pill>{draft.planner.time_format}</Pill>
                  <Pill>{draft.planner.date_format}</Pill>
                </div>
              </div>
              <div className="surface-2 p-3 d-flex align-items-center justify-content-between gap-2">
                <span className="fw-semibold">Notifications</span>
                <Pill variant={draft.notifications.notifications_enabled ? "success" : "warn"}>
                  {draft.notifications.notifications_enabled ? "Enabled" : "Disabled"}
                </Pill>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
