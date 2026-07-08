import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  BellFill,
  CalendarWeek,
  EnvelopePaperFill,
  FileEarmarkBarGraphFill,
  ShieldCheck,
  Stars,
} from "react-bootstrap-icons";

import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { SectionCard } from "@/components/ui/SectionCard";
import { useToast } from "@/context/ToastContext";

type EmailCategory =
  | "security_account"
  | "planning_reminders"
  | "goals_deadlines"
  | "reports_insights"
  | "data_events";

type EmailPreferenceKey =
  | "verification_reminders"
  | "password_changed_alert"
  | "new_device_alert"
  | "task_reminders"
  | "daily_motivational_quote"
  | "daily_brief"
  | "weekly_summary"
  | "streak_risk_alert"
  | "milestone_due_soon"
  | "goal_target_risk"
  | "daily_report_ready"
  | "weekly_report_ready"
  | "progress_coach_recommendations"
  | "export_ready";

type EmailPreferenceState = Record<EmailPreferenceKey, boolean>;

interface EmailPreferenceDefinition {
  key: EmailPreferenceKey;
  category: EmailCategory;
  label: string;
  description: string;
  defaultEnabled: boolean;
}

const STORAGE_KEY = "shadow.emailNotificationControls.v1";
const DEFAULT_DAILY_MOTIVATIONAL_QUOTE_TIME = "07:00";
const HHMM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const ALWAYS_SENT_EMAILS: string[] = [
  "Email verification links",
  "Account deletion confirmation",
  "Critical security notices",
];

const CATEGORY_META: Array<{
  id: EmailCategory;
  title: string;
  subtitle: string;
  icon: ReactNode;
}> = [
  {
    id: "security_account",
    title: "Security and account",
    subtitle: "Login safety and account integrity alerts.",
    icon: <ShieldCheck size={16} />,
  },
  {
    id: "planning_reminders",
    title: "Planning reminders",
    subtitle: "Daily nudges to keep execution consistent.",
    icon: <BellFill size={16} />,
  },
  {
    id: "goals_deadlines",
    title: "Goals and deadlines",
    subtitle: "Deadline pressure and milestone visibility.",
    icon: <Stars size={16} />,
  },
  {
    id: "reports_insights",
    title: "Reports and insights",
    subtitle: "Updates when summaries and analyses are ready.",
    icon: <FileEarmarkBarGraphFill size={16} />,
  },
  {
    id: "data_events",
    title: "Data events",
    subtitle: "Exports and account-level data operations.",
    icon: <CalendarWeek size={16} />,
  },
];

const EMAIL_PREFERENCE_DEFS: EmailPreferenceDefinition[] = [
  {
    key: "verification_reminders",
    category: "security_account",
    label: "Verification reminders",
    description: "Reminder if your email is still not verified.",
    defaultEnabled: true,
  },
  {
    key: "password_changed_alert",
    category: "security_account",
    label: "Password changed alert",
    description: "Notice whenever your password is changed.",
    defaultEnabled: true,
  },
  {
    key: "new_device_alert",
    category: "security_account",
    label: "New device alert",
    description: "Alert when a new device is connected to your account.",
    defaultEnabled: true,
  },
  {
    key: "task_reminders",
    category: "planning_reminders",
    label: "Task reminders",
    description: "Email reminders for scheduled task times.",
    defaultEnabled: true,
  },
  {
    key: "daily_motivational_quote",
    category: "planning_reminders",
    label: "Daily motivational quote",
    description: "Start your day with an AI-crafted boost of focus and confidence.",
    defaultEnabled: false,
  },
  {
    key: "daily_brief",
    category: "planning_reminders",
    label: "Daily brief",
    description: "A quick daily summary of priorities and focus.",
    defaultEnabled: true,
  },
  {
    key: "weekly_summary",
    category: "planning_reminders",
    label: "Weekly summary",
    description: "A weekly recap with momentum and carry-forward items.",
    defaultEnabled: true,
  },
  {
    key: "streak_risk_alert",
    category: "planning_reminders",
    label: "Streak risk alerts",
    description: "Heads-up when a streak is at risk of breaking.",
    defaultEnabled: true,
  },
  {
    key: "milestone_due_soon",
    category: "goals_deadlines",
    label: "Milestone due soon",
    description: "Reminder before an upcoming milestone deadline.",
    defaultEnabled: true,
  },
  {
    key: "goal_target_risk",
    category: "goals_deadlines",
    label: "Goal target risk",
    description: "Alert when a goal target date is close and progress is low.",
    defaultEnabled: true,
  },
  {
    key: "daily_report_ready",
    category: "reports_insights",
    label: "Daily report ready",
    description: "Notification when your daily report is generated.",
    defaultEnabled: true,
  },
  {
    key: "weekly_report_ready",
    category: "reports_insights",
    label: "Weekly report ready",
    description: "Notification when your weekly report is generated.",
    defaultEnabled: true,
  },
  {
    key: "progress_coach_recommendations",
    category: "reports_insights",
    label: "Progress Coach recommendations",
    description: "AI suggestions about what to track next.",
    defaultEnabled: false,
  },
  {
    key: "export_ready",
    category: "data_events",
    label: "Data export ready",
    description: "Notification when account export is prepared.",
    defaultEnabled: true,
  },
];

interface EmailControlStoragePayload {
  preferences: EmailPreferenceState;
  dailyMotivationalQuoteTime: string;
}

function buildDefaultPreferences(): EmailPreferenceState {
  return EMAIL_PREFERENCE_DEFS.reduce((acc, item) => {
    acc[item.key] = item.defaultEnabled;
    return acc;
  }, {} as EmailPreferenceState);
}

function isPreferenceKey(value: string): value is EmailPreferenceKey {
  return EMAIL_PREFERENCE_DEFS.some((item) => item.key === value);
}

function sanitizeDailyMotivationalQuoteTime(value: unknown): string {
  if (typeof value === "string" && HHMM_PATTERN.test(value)) {
    return value;
  }
  return DEFAULT_DAILY_MOTIVATIONAL_QUOTE_TIME;
}

function loadStoredPreferences(): EmailControlStoragePayload {
  const fallback = buildDefaultPreferences();
  if (typeof window === "undefined") {
    return {
      preferences: fallback,
      dailyMotivationalQuoteTime: DEFAULT_DAILY_MOTIVATIONAL_QUOTE_TIME,
    };
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return {
      preferences: fallback,
      dailyMotivationalQuoteTime: DEFAULT_DAILY_MOTIVATIONAL_QUOTE_TIME,
    };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    const parsedObject =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    const parsedPreferences =
      parsedObject.preferences &&
      typeof parsedObject.preferences === "object" &&
      !Array.isArray(parsedObject.preferences)
        ? (parsedObject.preferences as Record<string, unknown>)
        : parsedObject;

    const hydrated = { ...fallback };
    for (const [key, value] of Object.entries(parsedPreferences)) {
      if (!isPreferenceKey(key)) continue;
      if (typeof value !== "boolean") continue;
      hydrated[key] = value;
    }

    return {
      preferences: hydrated,
      dailyMotivationalQuoteTime: sanitizeDailyMotivationalQuoteTime(
        parsedObject.daily_motivational_quote_time,
      ),
    };
  } catch {
    return {
      preferences: fallback,
      dailyMotivationalQuoteTime: DEFAULT_DAILY_MOTIVATIONAL_QUOTE_TIME,
    };
  }
}

function persistPreferences(preferences: EmailPreferenceState, dailyMotivationalQuoteTime: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      preferences,
      daily_motivational_quote_time: dailyMotivationalQuoteTime,
    }),
  );
}

function preferencesEqual(left: EmailPreferenceState, right: EmailPreferenceState): boolean {
  return EMAIL_PREFERENCE_DEFS.every((item) => left[item.key] === right[item.key]);
}

interface EmailToggleRowProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  extraContent?: ReactNode;
}

function EmailToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
  extraContent,
}: EmailToggleRowProps) {
  return (
    <div className="surface-2 p-3 d-flex align-items-start justify-content-between gap-3">
      <div>
        <label htmlFor={id} className="fw-semibold d-block mb-1">
          {label}
        </label>
        <div className="text-muted-2 small">{description}</div>
        {extraContent ? <div className="mt-2">{extraContent}</div> : null}
      </div>
      <div className="form-check form-switch m-0 pt-1">
        <input
          id={id}
          className="form-check-input"
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
      </div>
    </div>
  );
}

export function EmailNotificationControlsPage() {
  const toast = useToast();
  const initialPreferencesRef = useRef<EmailControlStoragePayload>(loadStoredPreferences());

  const [draft, setDraft] = useState<EmailPreferenceState>(
    initialPreferencesRef.current.preferences,
  );
  const [baseline, setBaseline] = useState<EmailPreferenceState>(
    initialPreferencesRef.current.preferences,
  );
  const [dailyMotivationalQuoteTime, setDailyMotivationalQuoteTime] = useState<string>(
    initialPreferencesRef.current.dailyMotivationalQuoteTime,
  );
  const [baselineDailyMotivationalQuoteTime, setBaselineDailyMotivationalQuoteTime] = useState<string>(
    initialPreferencesRef.current.dailyMotivationalQuoteTime,
  );

  const enabledCount = useMemo(
    () => EMAIL_PREFERENCE_DEFS.filter((item) => draft[item.key]).length,
    [draft],
  );
  const hasChanges = useMemo(
    () =>
      !preferencesEqual(draft, baseline) ||
      dailyMotivationalQuoteTime !== baselineDailyMotivationalQuoteTime,
    [baseline, baselineDailyMotivationalQuoteTime, dailyMotivationalQuoteTime, draft],
  );

  function setCategoryEnabled(categoryId: EmailCategory, enabled: boolean) {
    setDraft((prev) => {
      const next = { ...prev };
      for (const item of EMAIL_PREFERENCE_DEFS) {
        if (item.category === categoryId) {
          next[item.key] = enabled;
        }
      }
      return next;
    });
  }

  function setAllEnabled(enabled: boolean) {
    setDraft((prev) => {
      const next = { ...prev };
      for (const item of EMAIL_PREFERENCE_DEFS) {
        next[item.key] = enabled;
      }
      return next;
    });
  }

  function resetToDefaults() {
    setDraft(buildDefaultPreferences());
    setDailyMotivationalQuoteTime(DEFAULT_DAILY_MOTIVATIONAL_QUOTE_TIME);
  }

  function saveLocalPreferences() {
    persistPreferences(draft, dailyMotivationalQuoteTime);
    setBaseline(draft);
    setBaselineDailyMotivationalQuoteTime(dailyMotivationalQuoteTime);
    toast.success("Email controls saved locally.");
  }

  return (
    <div>
      <PageHeader
        title="Email Notification Controls"
        subtitle="Control what lands in your inbox from Shadow."
        icon={<EnvelopePaperFill size={20} />}
        actions={
          <button
            type="button"
            className={`btn ${hasChanges ? "btn-brand" : "btn-outline-secondary"}`}
            onClick={saveLocalPreferences}
            disabled={!hasChanges}
          >
            {hasChanges ? "Save preferences" : "Saved"}
          </button>
        }
      />

      <SectionCard className="mb-4" title="Overview" subtitle="Shape the inbox to match how you operate.">
        <div className="d-flex flex-column gap-3">
          <div className="surface-2 p-3 d-flex flex-wrap align-items-center justify-content-between gap-2">
            <div className="d-flex align-items-center gap-2">
              <Pill variant="brand">{enabledCount} enabled</Pill>
              <Pill variant="muted">{EMAIL_PREFERENCE_DEFS.length - enabledCount} muted</Pill>
            </div>
            <div className="d-flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={() => setAllEnabled(true)}
              >
                Enable all
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={() => setAllEnabled(false)}
              >
                Mute all
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={resetToDefaults}
              >
                Reset defaults
              </button>
            </div>
          </div>

          <p className="text-muted-2 small mb-0">
            These controls are currently frontend-only and saved locally in this browser until backend
            preference sync is wired.
          </p>
        </div>
      </SectionCard>

      <SectionCard
        className="mb-4"
        title="Always sent"
        subtitle="Security-critical and account-integrity emails stay on."
      >
        <div className="d-flex flex-column gap-2">
          {ALWAYS_SENT_EMAILS.map((label) => (
            <div
              key={label}
              className="surface-2 p-3 d-flex align-items-center justify-content-between gap-2"
            >
              <span className="fw-semibold">{label}</span>
              <Pill variant="success">Required</Pill>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="row g-4">
        {[0, 1].map((columnIndex) => (
          <div key={columnIndex} className="col-12 col-lg-6">
            <div className="d-flex flex-column gap-4">
              {CATEGORY_META.filter((_, index) => index % 2 === columnIndex).map((category) => {
                const categoryItems = EMAIL_PREFERENCE_DEFS.filter((item) => item.category === category.id);
                const enabledInCategory = categoryItems.filter((item) => draft[item.key]).length;
                const allEnabled = enabledInCategory === categoryItems.length;

                return (
                  <SectionCard
                    key={category.id}
                    className="w-100"
                    title={
                      <span className="d-inline-flex align-items-center gap-2">
                        {category.icon} {category.title}
                      </span>
                    }
                    subtitle={category.subtitle}
                    actions={
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm"
                        onClick={() => setCategoryEnabled(category.id, !allEnabled)}
                      >
                        {allEnabled ? "Mute section" : "Enable section"}
                      </button>
                    }
                  >
                    <div className="d-flex flex-column gap-2">
                      {categoryItems.map((item) => (
                        <EmailToggleRow
                          key={item.key}
                          id={`email-pref-${item.key}`}
                          label={item.label}
                          description={item.description}
                          checked={draft[item.key]}
                          onChange={(checked) =>
                            setDraft((prev) => ({
                              ...prev,
                              [item.key]: checked,
                            }))
                          }
                          extraContent={
                            item.key === "daily_motivational_quote" && draft.daily_motivational_quote ? (
                              <div className="d-flex align-items-center flex-wrap gap-2">
                                <input
                                  id="daily-motivational-quote-time"
                                  type="time"
                                  className="form-control form-control-sm"
                                  style={{ width: 140 }}
                                  value={dailyMotivationalQuoteTime}
                                  onChange={(event) =>
                                    setDailyMotivationalQuoteTime(
                                      sanitizeDailyMotivationalQuoteTime(event.target.value),
                                    )
                                  }
                                />
                              </div>
                            ) : null
                          }
                        />
                      ))}
                    </div>
                  </SectionCard>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
