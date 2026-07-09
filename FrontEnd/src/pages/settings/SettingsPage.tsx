import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  BellFill,
  CalendarWeek,
  ChatSquareTextFill,
  Display,
  GearFill,
  Globe,
  MoonStarsFill,
  Palette2,
  Stars,
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
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { SectionCard } from "@/components/ui/SectionCard";
import { useAuth } from "@/context/AuthContext";
import { emitRuntimeSettingsUpdated } from "@/context/RuntimeSettingsContext";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { useAsync } from "@/hooks/useAsync";
import { formatMinutes } from "@/lib/format";

type SaveKey =
  | "appearance"
  | "notifications"
  | "ai"
  | "planner"
  | "privacy"
  | "integrations"
  | "accessibility";

const EMPTY_DIRTY_STATE: Record<SaveKey, boolean> = {
  appearance: false,
  notifications: false,
  ai: false,
  planner: false,
  privacy: false,
  integrations: false,
  accessibility: false,
};

const SECTION_FIELD_BY_SAVE_KEY = {
  appearance: "appearance",
  notifications: "notifications",
  ai: "ai_behavior",
  planner: "planner",
  privacy: "privacy",
  integrations: "integrations",
  accessibility: "accessibility",
} as const;

const SECTION_LABEL_BY_SAVE_KEY: Record<SaveKey, string> = {
  appearance: "Appearance",
  notifications: "Notifications",
  ai: "AI behavior",
  planner: "Planner defaults",
  privacy: "Privacy",
  integrations: "Integrations",
  accessibility: "Accessibility",
};

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
  { value: "dd/mm/yyyy", label: "MMM D, YYYY" },
];

const GEMINI_MODEL_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "gemini-3.5-pro", label: "Gemini 3.5 Pro" },
  { value: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { value: "gemini-3.5", label: "Gemini 3.5" },
  { value: "gemini-3-pro", label: "Gemini 3 Pro" },
  { value: "gemini-3-flash", label: "Gemini 3 Flash" },
  { value: "gemini-3-flash-lite", label: "Gemini 3 Flash Lite" },
  { value: "gemini-3", label: "Gemini 3" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
];

const DEFAULT_GEMINI_MODEL = GEMINI_MODEL_OPTIONS[0].value;

function isSupportedGeminiModel(value: string): boolean {
  return GEMINI_MODEL_OPTIONS.some((model) => model.value === value);
}

function normalizeSettingsForEditor(settings: SettingsRead): SettingsRead {
  const aiDefaultModel = isSupportedGeminiModel(settings.ai_behavior.ai_default_model)
    ? settings.ai_behavior.ai_default_model
    : DEFAULT_GEMINI_MODEL;

  return {
    ...settings,
    ai_behavior: {
      ...settings.ai_behavior,
      ai_default_model: aiDefaultModel,
    },
  };
}

function sectionsEqual<T>(left: T, right: T): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

function formatDynamicTransitionTime(value: string | null): string | null {
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  try {
    const formatter = new Intl.DateTimeFormat("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    });

    const parts = formatter.formatToParts(parsed);
    const hour = parts.find((part) => part.type === "hour")?.value;
    const minute = parts.find((part) => part.type === "minute")?.value;
    const dayPeriod = parts.find((part) => part.type === "dayPeriod")?.value;

    if (hour && minute && dayPeriod) {
      return `${hour}:${minute} ${dayPeriod.toUpperCase()} IST`;
    }

    return `${formatter.format(parsed).toUpperCase()} IST`;
  } catch {
    return null;
  }
}

type PushDeviceStatus =
  | "checking"
  | "unsupported"
  | "permission-denied"
  | "not-subscribed"
  | "subscribed";

function supportsWebPush(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

function base64UrlToArrayBuffer(base64Url: string): ArrayBuffer {
  const normalized = base64Url.trim().replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = window.atob(`${normalized}${padding}`);
  const arrayBuffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(arrayBuffer);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return arrayBuffer;
}

function arrayBufferToBase64Url(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  const base64 = window.btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function toPushSubscriptionPayload(
  subscription: PushSubscription,
): { endpoint: string; keys: { p256dh: string; auth: string } } | null {
  const payload = subscription.toJSON();
  const endpoint = payload.endpoint ?? subscription.endpoint;

  if (endpoint && payload.keys?.p256dh && payload.keys?.auth) {
    return {
      endpoint,
      keys: {
        p256dh: payload.keys.p256dh,
        auth: payload.keys.auth,
      },
    };
  }

  const p256dhKey = subscription.getKey("p256dh");
  const authKey = subscription.getKey("auth");
  if (!endpoint || !p256dhKey || !authKey) {
    return null;
  }

  return {
    endpoint,
    keys: {
      p256dh: arrayBufferToBase64Url(p256dhKey),
      auth: arrayBufferToBase64Url(authKey),
    },
  };
}

async function syncPushSubscriptionWithBackend(subscription: PushSubscription): Promise<void> {
  const payload = toPushSubscriptionPayload(subscription);
  if (!payload) {
    throw new Error("Could not read browser push subscription keys.");
  }
  await api.notifications.subscribe(payload);
}

interface ToggleRowProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  extraContent?: ReactNode;
}

function ToggleRow({ id, label, description, checked, onChange, disabled = false, extraContent }: ToggleRowProps) {
  return (
    <div className="d-flex align-items-start justify-content-between gap-3 surface-2 p-3">
      <div>
        <label className="fw-semibold d-block mb-1" htmlFor={id}>
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
          disabled={disabled}
          style={disabled ? { cursor: "not-allowed", pointerEvents: "none" } : undefined}
          onChange={(e) => onChange(e.target.checked)}
        />
      </div>
    </div>
  );
}

export function SettingsPage() {
  const { patchUser, user } = useAuth();
  const { setTheme, theme, dynamicThemeInfo } = useTheme();
  const toast = useToast();
  const isEmailVerified = Boolean(user?.email_verified);

  const settingsQuery = useAsync(() => api.settings.get(), []);
  const [draft, setDraft] = useState<SettingsRead | null>(null);
  const [baseline, setBaseline] = useState<SettingsRead | null>(null);
  const [saving, setSaving] = useState<Record<SaveKey, boolean>>({
    appearance: false,
    notifications: false,
    ai: false,
    planner: false,
    privacy: false,
    integrations: false,
    accessibility: false,
  });
  const [exportingData, setExportingData] = useState(false);
  const [clearingChat, setClearingChat] = useState(false);
  const [confirmClearChat, setConfirmClearChat] = useState(false);
  const [pushDeviceStatus, setPushDeviceStatus] = useState<PushDeviceStatus>("checking");
  const [pushSyncing, setPushSyncing] = useState(false);
  const [pushSyncIssue, setPushSyncIssue] = useState<string | null>(null);

  useEffect(() => {
    if (!settingsQuery.data || draft || baseline) return;

    const normalized = normalizeSettingsForEditor(settingsQuery.data);
    setDraft(normalized);
    setBaseline(normalized);
  }, [baseline, draft, settingsQuery.data]);

  useEffect(() => {
    let cancelled = false;

    async function inspectPushStatus() {
      if (!supportsWebPush()) {
        if (!cancelled) {
          setPushDeviceStatus("unsupported");
          setPushSyncIssue(null);
        }
        return;
      }

      if (Notification.permission === "denied") {
        if (!cancelled) {
          setPushDeviceStatus("permission-denied");
          setPushSyncIssue(null);
        }
        return;
      }

      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          if (!cancelled) {
            setPushDeviceStatus("not-subscribed");
            setPushSyncIssue(null);
          }
          return;
        }

        try {
          await syncPushSubscriptionWithBackend(subscription);
          if (!cancelled) {
            setPushDeviceStatus("subscribed");
            setPushSyncIssue(null);
          }
        } catch (err) {
          const message = getErrorMessage(
            err,
            "Couldn't sync this device with your account. Tap Connect this device to retry.",
          );
          if (!cancelled) {
            setPushDeviceStatus("not-subscribed");
            setPushSyncIssue(message);
          }
        }
      } catch {
        if (!cancelled) {
          setPushDeviceStatus("not-subscribed");
          setPushSyncIssue(null);
        }
      }
    }

    void inspectPushStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  function setSavingState(key: SaveKey, value: boolean) {
    setSaving((prev) => ({ ...prev, [key]: value }));
  }

  function preventSubmit(event: FormEvent) {
    event.preventDefault();
  }

  const dirtyBySection = useMemo<Record<SaveKey, boolean>>(() => {
    if (!draft || !baseline) return EMPTY_DIRTY_STATE;

    return {
      appearance: !sectionsEqual(draft.appearance, baseline.appearance),
      notifications: !sectionsEqual(draft.notifications, baseline.notifications),
      ai: !sectionsEqual(draft.ai_behavior, baseline.ai_behavior),
      planner: !sectionsEqual(draft.planner, baseline.planner),
      privacy: !sectionsEqual(draft.privacy, baseline.privacy),
      integrations: !sectionsEqual(draft.integrations, baseline.integrations),
      accessibility: !sectionsEqual(draft.accessibility, baseline.accessibility),
    };
  }, [baseline, draft]);

  const dirtySections = useMemo(
    () =>
      (Object.keys(dirtyBySection) as SaveKey[]).filter(
        (section) => dirtyBySection[section],
      ),
    [dirtyBySection],
  );

  const isSavingAny = useMemo(() => Object.values(saving).some(Boolean), [saving]);
  const hasPendingChanges = dirtySections.length > 0;

  const dynamicThemeMessage = useMemo(() => {
    if (!draft || draft.appearance.theme_preference !== "dynamic") return null;

    if (dynamicThemeInfo.mode === "location-unavailable") {
      return "Dynamic theme is enabled, but location access is not available. Using standard Indian sunrise and sunset timings.";
    }

    if (dynamicThemeInfo.mode === "api-failed") {
      return "Dynamic theme is enabled, but unable to fetch sunrise/sunset data. Using standard Indian sunrise and sunset timings.";
    }

    if (dynamicThemeInfo.mode === "success") {
      const transitionLabel = theme === "light" ? "sunset" : "sunrise";
      const formattedTime = formatDynamicTransitionTime(dynamicThemeInfo.nextTransitionAt);

      if (formattedTime) {
        const themeLabel = theme === "light" ? "Light" : "Dark";
        return `${themeLabel} theme till ${transitionLabel} at ${formattedTime}.`;
      }

      return "Dynamic theme is enabled and following sunrise/sunset timing.";
    }

    return "Dynamic theme is enabled. Resolving sunrise and sunset timing for your location...";
  }, [draft, dynamicThemeInfo, theme]);

  const pushStatusMessage = useMemo(() => {
    if (pushDeviceStatus === "checking") return "Checking device push support...";
    if (pushDeviceStatus === "unsupported") {
      return "This browser/device doesn't support Web Push. Use iPhone Safari and add Shadow to Home Screen.";
    }
    if (pushDeviceStatus === "permission-denied") {
      return "Notification permission is blocked. Enable notifications for Shadow in browser settings.";
    }
    if (pushDeviceStatus === "subscribed") {
      return "This device is connected for push notifications.";
    }
    if (pushSyncIssue) {
      return pushSyncIssue;
    }
    return "This device is not connected yet.";
  }, [pushDeviceStatus, pushSyncIssue]);

  async function ensurePushSubscriptionForDevice(): Promise<string> {
    if (!supportsWebPush()) {
      setPushSyncIssue(null);
      setPushDeviceStatus("unsupported");
      throw new Error("This device does not support Web Push notifications.");
    }

    if (Notification.permission === "denied") {
      setPushSyncIssue(null);
      setPushDeviceStatus("permission-denied");
      throw new Error("Notification permission is blocked for this app.");
    }

    const publicKeyPayload = await api.notifications.getPushPublicKey();
    if (!publicKeyPayload.configured || !publicKeyPayload.public_key) {
      throw new Error("Push notifications are not configured on the server yet.");
    }

    const permission =
      Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();

    if (permission !== "granted") {
      setPushSyncIssue(null);
      setPushDeviceStatus("permission-denied");
      throw new Error("Notification permission was not granted.");
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToArrayBuffer(publicKeyPayload.public_key),
      });
    }

    try {
      await syncPushSubscriptionWithBackend(subscription);
    } catch (err) {
      const message = getErrorMessage(err, "Couldn't register this device on the server.");
      setPushDeviceStatus("not-subscribed");
      setPushSyncIssue(message);
      throw new Error(message);
    }

    setPushSyncIssue(null);
    setPushDeviceStatus("subscribed");
    return subscription.endpoint;
  }

  async function removePushSubscriptionFromDevice() {
    if (!supportsWebPush()) {
      setPushSyncIssue(null);
      setPushDeviceStatus("unsupported");
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      setPushSyncIssue(null);
      setPushDeviceStatus("not-subscribed");
      return;
    }

    const endpoint = subscription.endpoint;
    await api.notifications.unsubscribe({ endpoint });
    await subscription.unsubscribe();
    setPushSyncIssue(null);
    setPushDeviceStatus("not-subscribed");
  }

  async function connectThisDeviceForPush() {
    if (pushSyncing) return;
    setPushSyncing(true);
    setPushSyncIssue(null);
    try {
      const connectedEndpoint = await ensurePushSubscriptionForDevice();
      setDraft((prev) =>
        prev
          ? {
              ...prev,
              notifications: {
                ...prev.notifications,
                push_notifications_enabled: true,
              },
            }
          : prev,
      );

      // Do not block connection success if cross-device notification creation fails.
      try {
        await api.notifications.notifyDeviceConnected({
          connected_endpoint: connectedEndpoint,
        });
      } catch {
        // no-op
      }

      toast.success("This device is ready for push. Save changes to activate account delivery.");
    } catch (err) {
      setPushDeviceStatus("not-subscribed");
      toast.error(getErrorMessage(err, "Couldn't connect this device for push."));
    } finally {
      setPushSyncing(false);
    }
  }

  async function disconnectThisDeviceFromPush() {
    if (pushSyncing) return;
    setPushSyncing(true);
    try {
      await removePushSubscriptionFromDevice();
      setDraft((prev) =>
        prev
          ? {
              ...prev,
              notifications: {
                ...prev.notifications,
                push_notifications_enabled: false,
              },
            }
          : prev,
      );
      toast.success("This device was disconnected from push notifications.");
    } catch (err) {
      toast.error(getErrorMessage(err, "Couldn't disconnect this device from push."));
    } finally {
      setPushSyncing(false);
    }
  }

  async function saveChangedSections() {
    if (!draft || !baseline || isSavingAny || dirtySections.length === 0) return;

    const snapshot = draft;
    const succeeded: SaveKey[] = [];
    const failures: Array<{ section: SaveKey; message: string }> = [];

    for (const section of dirtySections) {
      setSavingState(section, true);
      try {
        let updated: SettingsRead;
        if (section === "appearance") {
          updated = await api.settings.updateAppearance({
            theme_preference: snapshot.appearance.theme_preference,
          });
        } else if (section === "notifications") {
          const wasPushEnabled = baseline.notifications.push_notifications_enabled;
          const willEnablePush = snapshot.notifications.push_notifications_enabled;

          if (!wasPushEnabled && willEnablePush) {
            await ensurePushSubscriptionForDevice();
          }
          if (wasPushEnabled && !willEnablePush) {
            await removePushSubscriptionFromDevice();
          }

          updated = await api.settings.updateNotifications(snapshot.notifications);
        } else if (section === "ai") {
          updated = await api.settings.updateAIBehavior(snapshot.ai_behavior);
        } else if (section === "planner") {
          updated = await api.settings.updatePlanner(snapshot.planner);
        } else if (section === "privacy") {
          updated = await api.settings.updatePrivacy(snapshot.privacy);
        } else if (section === "integrations") {
          updated = await api.settings.updateIntegrations(snapshot.integrations);
        } else {
          updated = await api.settings.updateAccessibility(snapshot.accessibility);
        }

        const normalized = normalizeSettingsForEditor(updated);
        const field = SECTION_FIELD_BY_SAVE_KEY[section];
        const savedSectionValue = normalized[field];

        emitRuntimeSettingsUpdated(normalized);

        setBaseline((prev) => (prev ? { ...prev, [field]: savedSectionValue } : prev));
        setDraft((prev) => (prev ? { ...prev, [field]: savedSectionValue } : prev));

        if (section === "appearance") {
          setTheme(normalized.appearance.theme_preference);
          patchUser({ theme_preference: normalized.appearance.theme_preference });
        }

        succeeded.push(section);
      } catch (err) {
        failures.push({
          section,
          message: err instanceof ApiError ? err.message : "Couldn't save this section.",
        });
      } finally {
        setSavingState(section, false);
      }
    }

    if (failures.length === 0) {
      if (succeeded.length === 1) {
        toast.success(`${SECTION_LABEL_BY_SAVE_KEY[succeeded[0]]} settings updated.`);
      } else {
        toast.success(`Saved ${succeeded.length} changed sections.`);
      }
      return;
    }

    const failedLabels = failures
      .map((failure) => SECTION_LABEL_BY_SAVE_KEY[failure.section])
      .join(", ");

    if (succeeded.length > 0) {
      toast.error(
        `Saved ${succeeded.length} section${succeeded.length === 1 ? "" : "s"}, but failed: ${failedLabels}.`,
      );
      return;
    }

    if (failures.length === 1) {
      toast.error(`Couldn't save ${failedLabels}: ${failures[0].message}`);
      return;
    }

    toast.error(`Couldn't save changes. Failed sections: ${failedLabels}.`);
  }

  async function exportData() {
    if (!isEmailVerified) {
      toast.error("Verify your email first to export account data.");
      return;
    }

    setExportingData(true);
    try {
      const payload = await api.profile.exportAccountData();
      const fileName = `shadow-export-${new Date(payload.exported_at).toISOString().slice(0, 10)}.json`;
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("Account export downloaded.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't export your account data.");
    } finally {
      setExportingData(false);
    }
  }

  async function clearChatHistory() {
    setClearingChat(true);
    try {
      const result = await api.profile.clearChatHistory();
      toast.success(
        `Cleared ${result.deleted_sessions} chat session(s) and ${result.deleted_messages} message(s).`,
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't clear chat history.");
    } finally {
      setClearingChat(false);
      setConfirmClearChat(false);
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

  function chooseBrowserDefault() {
    chooseTheme("browser");
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
        actions={
          <button
            type="button"
            className="btn btn-brand"
            onClick={saveChangedSections}
            disabled={!hasPendingChanges || isSavingAny}
          >
            {isSavingAny
              ? "Saving..."
              : hasPendingChanges
                ? `Save changes${dirtySections.length > 1 ? ` (${dirtySections.length})` : ""}`
                : "Saved"}
          </button>
        }
      />

      <section className="surface settings-hero py-3 py-sm-4 px-4 px-sm-5 mb-4">
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
            <form onSubmit={preventSubmit}>
              <div className="row g-3">
                {[
                  { value: "light" as ThemePreference, label: "Light", icon: SunFill },
                  { value: "dark" as ThemePreference, label: "Dark", icon: MoonStarsFill },
                  { value: "browser" as const, label: "Browser Default", icon: Display },
                  { value: "dynamic" as const, label: "Dynamic", icon: Stars },
                ].map((option) => {
                  const Icon = option.icon;
                  const active = draft.appearance.theme_preference === option.value;
                  return (
                    <div className="col-12 col-md-6" key={option.value}>
                      <button
                        type="button"
                        className="surface-2 w-100 p-3 border-0 d-flex align-items-center gap-2 clickable setting-grid-option"
                        style={{
                          outline: active ? "2px solid var(--jv-brand-1)" : "2px solid transparent",
                        }}
                        onClick={() => {
                          if (option.value === "browser") {
                            chooseBrowserDefault();
                            return;
                          }
                          chooseTheme(option.value);
                        }}
                      >
                        <span className="stat-icon" style={{ width: 38, height: 38 }}>
                          <Icon size={17} />
                        </span>
                        <span className="fw-semibold">{option.label}</span>
                        {/* {active && <span className="ms-auto pill pill-brand">Active</span>} */}
                      </button>
                    </div>
                  );
                })}
              </div>
              {draft.appearance.theme_preference === "dynamic" ? (
                <div className="text-muted-2 small mt-3" data-testid="dynamic-theme-message">
                  {dynamicThemeMessage}
                </div>
              ) : null}
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
            <form onSubmit={preventSubmit} className="d-flex flex-column gap-2">
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
              <div className="surface-2 p-3 d-flex flex-column gap-2">
                <div className="d-flex align-items-start justify-content-between gap-3">
                  <div>
                    <label className="fw-semibold d-block mb-1" htmlFor="notify-push">
                      Push notifications
                    </label>
                    <div className="text-muted-2 small">
                      Get browser push notifications when enabled in your device.
                    </div>
                  </div>
                  <div className="form-check form-switch m-0 pt-1">
                    <input
                      id="notify-push"
                      className="form-check-input"
                      type="checkbox"
                      checked={draft.notifications.push_notifications_enabled}
                      onChange={(e) =>
                        setDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                notifications: {
                                  ...prev.notifications,
                                  push_notifications_enabled: e.target.checked,
                                },
                              }
                            : prev,
                        )
                      }
                    />
                  </div>
                </div>

                {draft.notifications.push_notifications_enabled ? (
                  <>
                    <hr className="my-1" />
                    <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
                      <span className="fw-semibold">This device</span>
                      <Pill variant={pushDeviceStatus === "subscribed" ? "success" : "muted"}>
                        {pushDeviceStatus === "subscribed" ? "Connected" : "Not connected"}
                      </Pill>
                    </div>
                    <div className="text-muted-2 small">{pushStatusMessage}</div>
                    <div className="d-flex flex-wrap gap-2">
                      {pushDeviceStatus === "subscribed" ? (
                        <button
                          type="button"
                          className="btn btn-outline-secondary btn-sm"
                          onClick={disconnectThisDeviceFromPush}
                          disabled={pushSyncing}
                        >
                          Disconnect device
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-outline-secondary btn-sm"
                          onClick={connectThisDeviceForPush}
                          disabled={
                            pushSyncing ||
                            pushDeviceStatus === "unsupported" ||
                            pushDeviceStatus === "permission-denied"
                          }
                        >
                          {pushSyncing ? "Connecting..." : "Connect this device"}
                        </button>
                      )}
                    </div>
                  </>
                ) : null}
              </div>

              <ToggleRow
                id="notify-email"
                label="Email notifications"
                description="Receive reminder emails for important planning events."
                checked={isEmailVerified && draft.notifications.email_notifications_enabled}
                disabled={!isEmailVerified}
                onChange={(checked) =>
                  setDraft((prev) => {
                    if (!prev) return prev;
                    return {
                      ...prev,
                      notifications: { ...prev.notifications, email_notifications_enabled: checked },
                    };
                  })
                }
                extraContent={
                  <>
                    {!isEmailVerified ? (
                      <div className="text-warning small" role="status">
                        Verify your email to enable email notifications.
                      </div>
                    ) : null}
                    {isEmailVerified && draft.notifications.email_notifications_enabled ? (
                      <Link to="/settings/email-controls" className="btn btn-outline-secondary btn-sm">
                        Control what you see
                      </Link>
                    ) : null}
                  </>
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
              <ToggleRow
                id="notify-weekly-summary"
                label="Weekly summary"
                description="Receive a weekly summary reminder at your configured brief time."
                checked={draft.notifications.weekly_summary_enabled}
                onChange={(checked) =>
                  setDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          notifications: { ...prev.notifications, weekly_summary_enabled: checked },
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
            <form onSubmit={preventSubmit} className="d-flex flex-column gap-2">
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
                description="When disabled, Shadow ignores long-term memory for responses. Turning off AI memory does not delete saved memories; it only controls whether they are used in AI context assembly."
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
              <div className="surface-2 p-3 d-flex flex-column flex-sm-row gap-2">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={exportData}
                  disabled={exportingData}
                >
                  {exportingData ? "Exporting..." : "Export my data"}
                </button>
                <button
                  type="button"
                  className="btn btn-outline-danger"
                  onClick={() => setConfirmClearChat(true)}
                  disabled={clearingChat}
                >
                  Clear chat history
                </button>
              </div>
            </form>
          </SectionCard>

          <SectionCard title="Accessibility" subtitle="Readability and motion preferences.">
            <form onSubmit={preventSubmit} className="d-flex flex-column gap-2">
              <ToggleRow
                id="accessibility-reduced-motion"
                label="Reduced motion"
                description="Minimize motion-heavy UI transitions where possible."
                checked={draft.accessibility.reduced_motion}
                onChange={(checked) =>
                  setDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          accessibility: { ...prev.accessibility, reduced_motion: checked },
                        }
                      : prev,
                  )
                }
              />
              <ToggleRow
                id="accessibility-high-contrast"
                label="High contrast"
                description="Increase contrast in supported UI surfaces for better readability."
                checked={draft.accessibility.high_contrast}
                onChange={(checked) =>
                  setDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          accessibility: { ...prev.accessibility, high_contrast: checked },
                        }
                      : prev,
                  )
                }
              />
              <div className="surface-2 p-3">
                <label className="form-label" htmlFor="font-scale-percent">
                  Font scale ({draft.accessibility.font_scale_percent}%)
                </label>
                <input
                  id="font-scale-percent"
                  type="range"
                  min={80}
                  max={140}
                  step={5}
                  className="form-range"
                  value={draft.accessibility.font_scale_percent}
                  onChange={(e) =>
                    setDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            accessibility: {
                              ...prev.accessibility,
                              font_scale_percent: Number(e.target.value),
                            },
                          }
                        : prev,
                    )
                  }
                />
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
            <form onSubmit={preventSubmit} className="d-flex flex-column gap-3">
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

              <div className="surface-2 p-3">
                <label className="form-label" htmlFor="ai-default-model">
                  Default model
                </label>
                <select
                  id="ai-default-model"
                  className="form-select"
                  value={draft.ai_behavior.ai_default_model}
                  onChange={(e) =>
                    setDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            ai_behavior: {
                              ...prev.ai_behavior,
                              ai_default_model: e.target.value,
                            },
                          }
                        : prev,
                    )
                  }
                >
                  {GEMINI_MODEL_OPTIONS.map((model) => (
                    <option key={model.value} value={model.value}>
                      {model.label}
                    </option>
                  ))}
                </select>
                <div className="form-text">Only Gemini models are available for this workspace.</div>
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
            <form onSubmit={preventSubmit} className="d-flex flex-column gap-3">
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

            </form>
          </SectionCard>

          <SectionCard title="Automation" subtitle="Manage background workflows and schedules.">
              <Link to="/automation" className="btn btn-outline-secondary">
                Show automations
              </Link>
          </SectionCard>

          <SectionCard title="Current Snapshot" subtitle="Quick view of active behavior config.">
            <div className="d-flex flex-column gap-2">
              <div className="surface-2 p-3 d-flex align-items-center justify-content-between gap-2">
                <span className="fw-semibold">Response style</span>
                <div className="d-flex gap-2 flex-wrap justify-content-end">
                  <Pill variant="brand">{draft.ai_behavior.ai_personality}</Pill>
                  <Pill>{draft.ai_behavior.ai_response_length.replace("_", " ")}</Pill>
                  <Pill>{draft.ai_behavior.ai_default_model || "auto"}</Pill>
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
                <div className="d-flex gap-2 flex-wrap justify-content-end">
                  <Pill variant={draft.notifications.notifications_enabled ? "success" : "warn"}>
                    {draft.notifications.notifications_enabled ? "Enabled" : "Disabled"}
                  </Pill>
                  <Pill variant={draft.notifications.weekly_summary_enabled ? "info" : "muted"}>
                    Weekly summary {draft.notifications.weekly_summary_enabled ? "On" : "Off"}
                  </Pill>
                </div>
              </div>
              <div className="surface-2 p-3 d-flex align-items-center justify-content-between gap-2">
                <span className="fw-semibold">Accessibility</span>
                <div className="d-flex gap-2 flex-wrap justify-content-end">
                  <Pill>{draft.accessibility.font_scale_percent}% text</Pill>
                  <Pill variant={draft.accessibility.reduced_motion ? "info" : "muted"}>
                    Motion {draft.accessibility.reduced_motion ? "Reduced" : "Normal"}
                  </Pill>
                </div>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>

      <ConfirmDialog
        show={confirmClearChat}
        title="Clear chat history?"
        message="This will delete all existing chat sessions and messages for your account."
        confirmLabel="Clear history"
        destructive
        busy={clearingChat}
        onConfirm={clearChatHistory}
        onCancel={() => setConfirmClearChat(false)}
      />
    </div>
  );
}
