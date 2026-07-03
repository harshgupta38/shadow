/**
 * TypeScript types mirroring the Shadow backend Pydantic schemas.
 * Keep in sync with `BackEnd/app/schemas` and `BackEnd/app/models/enums.py`.
 */

// ── Enums (string unions match backend `str, enum.Enum` values) ────────────
export type ThemePreference = "light" | "dark";

export type AIResponseLength = "short" | "balanced" | "detailed" | "very_detailed";
export type AIPersonality =
  | "professional"
  | "friendly"
  | "coach"
  | "teacher"
  | "mentor"
  | "minimal";
export type WeekStartsOn = "monday" | "sunday";
export type TimeFormat = "12h" | "24h";
export type DateFormat = "dd/mm/yyyy" | "mm/dd/yyyy" | "yyyy-mm-dd";

export type MemoryCategory =
  | "daily"
  | "weekly"
  | "monthly"
  | "career"
  | "life"
  | "personality"
  | "other";

export type MemorySource = "onboarding" | "chat" | "manual" | "behavior";

export type GoalStatus = "active" | "paused" | "completed" | "archived";

export type MilestoneStatus = "todo" | "in_progress" | "done";

export type AgentType =
  | "onboarding"
  | "goal_coach"
  | "career_advisor"
  | "daily_checkin"
  | "progress_analyst"
  | "general";

export type ChatRole = "user" | "assistant" | "system";

export type NotificationType = "reminder" | "system" | "agent";

export type MetricUnit = "count" | "minutes" | "hours" | "custom";

export type MetricType = "default" | "custom";

export type ActivitySource = "manual" | "integration";

export type PlannedTaskStatus = "planned" | "done" | "missed";

export type ReportPeriod = "daily" | "weekly";

export type JournalMood = "Great" | "Good" | "Okay" | "Low" | "Rough";

// ── Auth & user ────────────────────────────────────────────────────────────
export interface User {
  id: number;
  email: string;
  name: string;
  timezone: string;
  theme_preference: ThemePreference;
  subscription_plan: string;
  email_verified: boolean;
  auth_provider: string;
  last_password_changed_at: string;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  timezone?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface Token {
  access_token: string;
  token_type: string;
}

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

export interface ProfileUpdate {
  name?: string;
  timezone?: string;
  theme_preference?: ThemePreference;
}

export interface BasicProfile {
  user_id: number;
  email: string;
  name: string;
  timezone: string;
  member_since: string;
  display_name: string | null;
  profile_picture_url: string | null;
  current_role: string | null;
  current_goal: string | null;
  phone_number: string | null;
  short_bio: string | null;
}

export interface BasicProfileUpdate {
  name?: string;
  timezone?: string;
  display_name?: string | null;
  profile_picture_url?: string | null;
  current_role?: string | null;
  current_goal?: string | null;
  phone_number?: string | null;
  short_bio?: string | null;
}

export interface AIProfile {
  profession: string | null;
  industry: string | null;
  experience_summary: string | null;
  primary_tech_stack: string | null;
  current_company: string | null;
  dream_company: string | null;
  interview_preparation_status: string | null;
  long_term_vision: string | null;
  current_goals_overview: string | null;
  daily_routine: string | null;
  working_style: string | null;
  learning_profile: string | null;
  productivity_preferences: string | null;
  motivation: string | null;
  always_remember: string | null;
  profile_version: number;
  updated_at: string;
}

export interface AIProfileUpdate {
  profession?: string | null;
  industry?: string | null;
  experience_summary?: string | null;
  primary_tech_stack?: string | null;
  current_company?: string | null;
  dream_company?: string | null;
  interview_preparation_status?: string | null;
  long_term_vision?: string | null;
  current_goals_overview?: string | null;
  daily_routine?: string | null;
  working_style?: string | null;
  learning_profile?: string | null;
  productivity_preferences?: string | null;
  motivation?: string | null;
  always_remember?: string | null;
}

export interface AccountOverview {
  user_id: number;
  email: string;
  auth_provider: string;
  email_verified: boolean;
  subscription_plan: string;
  member_since: string;
  last_password_changed_at: string;
}

export interface ChatHistoryClearResult {
  deleted_sessions: number;
  deleted_messages: number;
}

export interface AccountDataExport {
  exported_at: string;
  data: Record<string, unknown>;
}

export interface DeleteAccountRequest {
  confirmation_text: string;
}

// ── Memory ─────────────────────────────────────────────────────────────────
export interface MemoryEntry {
  id: number;
  category: MemoryCategory;
  question: string | null;
  answer: string | null;
  ai_understanding: string;
  source: MemorySource;
  created_at: string;
  updated_at: string;
}

export interface MemoryEntryCreate {
  category?: MemoryCategory;
  ai_understanding: string;
  question?: string | null;
  answer?: string | null;
  source?: MemorySource;
}

export interface MemoryEntryUpdate {
  category?: MemoryCategory;
  ai_understanding?: string;
  question?: string | null;
  answer?: string | null;
}

export interface MemoryRefineRequest {
  text: string;
  category?: MemoryCategory;
}

export type MemoryRefineStatus = "refined" | "fallback";

export interface MemoryRefineResponse {
  refined_text: string;
  status: MemoryRefineStatus;
  reason?: string | null;
}

export interface MemoryCenterEntry {
  id: number;
  category: MemoryCategory;
  value: string;
  source: MemorySource;
  confidence: string;
  editable: boolean;
  why_known: string;
  used_by: string[];
  created_at: string;
  updated_at: string;
}

export interface AppearanceSettings {
  theme_preference: ThemePreference;
}

export interface NotificationSettings {
  notifications_enabled: boolean;
  push_notifications_enabled: boolean;
  email_notifications_enabled: boolean;
  reminder_notifications_enabled: boolean;
  daily_brief_enabled: boolean;
  daily_brief_time: string;
  weekly_summary_enabled: boolean;
}

export interface AIBehaviorSettings {
  ai_response_length: AIResponseLength;
  ai_personality: AIPersonality;
  ai_default_model: string;
  ai_suggestions_enabled: boolean;
  smart_planning_enabled: boolean;
}

export interface PlannerSettings {
  week_starts_on: WeekStartsOn;
  default_reminder_time: string;
  default_task_duration_minutes: number;
  time_format: TimeFormat;
  date_format: DateFormat;
}

export interface PrivacySettings {
  analytics_opt_out: boolean;
  ai_memory_enabled: boolean;
}

export interface IntegrationSettings {
  google_calendar_enabled: boolean;
  slack_enabled: boolean;
}

export interface AccessibilitySettings {
  reduced_motion: boolean;
  high_contrast: boolean;
  font_scale_percent: number;
}

export interface SettingsRead {
  appearance: AppearanceSettings;
  notifications: NotificationSettings;
  ai_behavior: AIBehaviorSettings;
  planner: PlannerSettings;
  privacy: PrivacySettings;
  integrations: IntegrationSettings;
  accessibility: AccessibilitySettings;
}

export interface AppearanceSettingsUpdate {
  theme_preference: ThemePreference;
}

export interface NotificationSettingsUpdate {
  notifications_enabled?: boolean;
  push_notifications_enabled?: boolean;
  email_notifications_enabled?: boolean;
  reminder_notifications_enabled?: boolean;
  daily_brief_enabled?: boolean;
  daily_brief_time?: string;
  weekly_summary_enabled?: boolean;
}

export interface AIBehaviorSettingsUpdate {
  ai_response_length?: AIResponseLength;
  ai_personality?: AIPersonality;
  ai_default_model?: string;
  ai_suggestions_enabled?: boolean;
  smart_planning_enabled?: boolean;
}

export interface PlannerSettingsUpdate {
  week_starts_on?: WeekStartsOn;
  default_reminder_time?: string;
  default_task_duration_minutes?: number;
  time_format?: TimeFormat;
  date_format?: DateFormat;
}

export interface PrivacySettingsUpdate {
  analytics_opt_out?: boolean;
  ai_memory_enabled?: boolean;
}

export interface IntegrationSettingsUpdate {
  google_calendar_enabled?: boolean;
  slack_enabled?: boolean;
}

export interface AccessibilitySettingsUpdate {
  reduced_motion?: boolean;
  high_contrast?: boolean;
  font_scale_percent?: number;
}

// ── Onboarding ─────────────────────────────────────────────────────────────
export interface OnboardingQuestion {
  id: string;
  category: MemoryCategory;
  question: string;
  order: number;
}

export interface OnboardingAnswerRequest {
  question_id: string;
  question: string;
  category?: MemoryCategory;
  answer: string;
}

export interface OnboardingAnswerResponse {
  understanding: string;
  memory: MemoryEntry;
}

// ── Goals & milestones ─────────────────────────────────────────────────────
export interface Milestone {
  id: number;
  goal_id: number;
  title: string;
  description: string | null;
  status: MilestoneStatus;
  order: number;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface MilestoneCreate {
  title: string;
  description?: string | null;
  status?: MilestoneStatus;
  order?: number;
  due_date?: string | null;
}

export interface MilestoneUpdate {
  title?: string;
  description?: string | null;
  status?: MilestoneStatus;
  order?: number;
  due_date?: string | null;
}

export interface Goal {
  id: number;
  title: string;
  description: string | null;
  category: string | null;
  status: GoalStatus;
  progress: number;
  target_date: string | null;
  created_at: string;
  updated_at: string;
  milestones: Milestone[];
}

export interface GoalCreate {
  title: string;
  description?: string | null;
  category?: string | null;
  target_date?: string | null;
}

export interface GoalUpdate {
  title?: string;
  description?: string | null;
  category?: string | null;
  status?: GoalStatus;
  progress?: number;
  target_date?: string | null;
}

// ── Chat ───────────────────────────────────────────────────────────────────
export interface ChatSession {
  id: number;
  agent_type: AgentType;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatSessionCreate {
  agent_type?: AgentType;
  title?: string;
}

export interface ChatMessage {
  id: number;
  session_id: number;
  role: ChatRole;
  content: string;
  agent_type: AgentType;
  created_at: string;
}

export interface ChatSendResponse {
  user_message: ChatMessage;
  assistant_message: ChatMessage;
}

// ── Journal ────────────────────────────────────────────────────────────────
export interface JournalEntry {
  id: number;
  content: string;
  mood: JournalMood | null;
  goal_alignment: string | null;
  shadow_response: string | null;
  created_at: string;
  updated_at: string;
}

export interface JournalCreate {
  content: string;
  mood?: JournalMood | null;
}

export interface JournalUpdate {
  content?: string;
  mood?: JournalMood | null;
}

// ── Notifications ──────────────────────────────────────────────────────────
export interface Notification {
  id: number;
  title: string;
  body: string | null;
  type: NotificationType;
  related_goal_id: number | null;
  scheduled_at: string | null;
  sent: boolean;
  read: boolean;
  created_at: string;
}

export interface NotificationCreate {
  title: string;
  body?: string | null;
  type?: NotificationType;
  related_goal_id?: number | null;
  scheduled_at?: string | null;
}

// ── Metrics & activity ─────────────────────────────────────────────────────
export interface TrackedMetric {
  id: number;
  key: string;
  label: string;
  unit: MetricUnit;
  type: MetricType;
  target: number | null;
  active: boolean;
  created_at: string;
}

export interface MetricCreate {
  key: string;
  label: string;
  unit?: MetricUnit;
  target?: number | null;
}

export interface MetricUpdate {
  label?: string;
  unit?: MetricUnit;
  target?: number | null;
  active?: boolean;
}

export interface ActivityLog {
  id: number;
  metric_id: number;
  date: string;
  value: number;
  note: string | null;
  source: ActivitySource;
  created_at: string;
}

export interface ActivityLogCreate {
  value: number;
  date?: string | null;
  note?: string | null;
}

// ── Plan ───────────────────────────────────────────────────────────────────
export interface PlannedTask {
  id: number;
  title: string;
  date: string;
  reminder_time: string | null;
  estimated_duration_minutes: number | null;
  status: PlannedTaskStatus;
  related_goal_id: number | null;
  completed_at: string | null;
  created_at: string;
}

export interface PlannedTaskCreate {
  title: string;
  date?: string | null;
  related_goal_id?: number | null;
  reminder_time?: string | null;
  estimated_duration_minutes?: number | null;
}

export interface PlannedTaskUpdate {
  title?: string;
  status?: PlannedTaskStatus;
  related_goal_id?: number | null;
  reminder_time?: string | null;
  estimated_duration_minutes?: number | null;
}

// ── Reports ────────────────────────────────────────────────────────────────
export interface Report {
  id: number;
  period: ReportPeriod;
  period_start: string;
  period_end: string;
  metrics_json: ReportMetricsJson;
  narrative: string | null;
  next_steps: string | null;
  created_at: string;
}

export interface ReportMetricRow {
  key: string;
  label: string;
  unit: string;
  total: number;
  target: number | null;
  streak_days: number;
}

/** Rolled-up metrics payload produced by the Progress Analyst (see report_service). */
export interface ReportMetricsJson {
  tasks: { planned: number; completed: number };
  metrics: ReportMetricRow[];
}

export interface ReportGenerateRequest {
  period?: ReportPeriod;
  on_date?: string | null;
}

// ── Dashboard ──────────────────────────────────────────────────────────────
export interface MetricSummary {
  metric_id: number;
  key: string;
  label: string;
  unit: string;
  today_total: number;
  week_total: number;
  target: number | null;
  streak_days: number;
}

export interface DashboardSummary {
  goals_total: number;
  goals_active: number;
  goals_completed: number;
  average_progress: number;
  tasks_today_total: number;
  tasks_today_done: number;
  active_goals: Goal[];
  metrics: MetricSummary[];
  upcoming_tasks: PlannedTask[];
  unread_notifications: Notification[];
}

// ── Generic API error shape ────────────────────────────────────────────────
export interface ApiErrorShape {
  message: string;
  status?: number;
  fieldErrors?: Record<string, string>;
}
