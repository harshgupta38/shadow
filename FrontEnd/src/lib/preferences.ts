/**
 * Device-level preferences (persisted in localStorage).
 *
 * These control how the app *behaves and looks* on this device. Account
 * identity and AI-profile data live on the backend (see the profile API);
 * everything here is intentionally local so it works instantly and offline.
 */

export type AccentColor = "violet" | "blue" | "green" | "rose" | "amber";
export type FontScale = "sm" | "md" | "lg";
export type ResponseLength = "concise" | "balanced" | "detailed";
export type AIPersonality = "friendly" | "professional" | "direct" | "motivational";
export type WeekStart = "sunday" | "monday";
export type TimeFormat = "12h" | "24h";
export type DateFormat = "MDY" | "DMY" | "YMD";

export interface Preferences {
  // Appearance
  accent: AccentColor;
  fontScale: FontScale;
  // Accessibility
  reduceMotion: boolean;
  highContrast: boolean;
  largerText: boolean;
  // Notifications
  notifPush: boolean;
  notifEmail: boolean;
  notifReminders: boolean;
  notifWeeklySummary: boolean;
  notifAiDailyBrief: boolean;
  // AI behaviour
  aiResponseLength: ResponseLength;
  aiPersonality: AIPersonality;
  aiSuggestions: boolean;
  aiSmartPlanning: boolean;
  // Planner
  weekStartsOn: WeekStart;
  defaultReminderTime: string; // "HH:MM"
  defaultTaskDuration: number; // minutes
  timeFormat: TimeFormat;
  dateFormat: DateFormat;
  // Privacy
  analytics: boolean;
  dataCollection: boolean;
  aiMemory: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  accent: "violet",
  fontScale: "md",
  reduceMotion: false,
  highContrast: false,
  largerText: false,
  notifPush: true,
  notifEmail: true,
  notifReminders: true,
  notifWeeklySummary: true,
  notifAiDailyBrief: false,
  aiResponseLength: "balanced",
  aiPersonality: "friendly",
  aiSuggestions: true,
  aiSmartPlanning: true,
  weekStartsOn: "monday",
  defaultReminderTime: "09:00",
  defaultTaskDuration: 30,
  timeFormat: "12h",
  dateFormat: "MDY",
  analytics: false,
  dataCollection: false,
  aiMemory: true,
};

const STORAGE_KEY = "shadow.preferences";

export function loadPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return { ...DEFAULT_PREFERENCES, ...parsed };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(prefs: Preferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore storage errors (private mode, quota, etc.) */
  }
}

const FONT_BASE_PX: Record<FontScale, number> = { sm: 15, md: 16, lg: 17 };

/**
 * Apply the visual preferences to the document root. Idempotent — safe to
 * call on startup (avoids a flash) and again whenever preferences change.
 */
export function applyAppearance(prefs: Preferences): void {
  const el = document.documentElement;

  el.setAttribute("data-accent", prefs.accent);

  if (prefs.reduceMotion) el.setAttribute("data-reduce-motion", "true");
  else el.removeAttribute("data-reduce-motion");

  if (prefs.highContrast) el.setAttribute("data-contrast", "high");
  else el.removeAttribute("data-contrast");

  const px = FONT_BASE_PX[prefs.fontScale] + (prefs.largerText ? 1 : 0);
  el.style.fontSize = `${px}px`;
}
