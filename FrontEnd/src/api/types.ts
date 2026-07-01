/**
 * TypeScript types mirroring the Jarvis backend Pydantic schemas.
 * Keep in sync with `BackEnd/app/schemas` and `BackEnd/app/models/enums.py`.
 */

// ── Enums (string unions match backend `str, enum.Enum` values) ────────────
export type ThemePreference = "light" | "dark";

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

// ── Auth & user ────────────────────────────────────────────────────────────
export interface User {
  id: number;
  email: string;
  name: string;
  timezone: string;
  theme_preference: ThemePreference;
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

export interface ProfileUpdate {
  name?: string;
  timezone?: string;
  theme_preference?: ThemePreference;
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
  mood: string | null;
  created_at: string;
  updated_at: string;
}

export interface JournalCreate {
  content: string;
  mood?: string | null;
}

export interface JournalUpdate {
  content?: string;
  mood?: string | null;
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
  status: PlannedTaskStatus;
  related_goal_id: number | null;
  completed_at: string | null;
  created_at: string;
}

export interface PlannedTaskCreate {
  title: string;
  date?: string | null;
  related_goal_id?: number | null;
}

export interface PlannedTaskUpdate {
  title?: string;
  status?: PlannedTaskStatus;
  related_goal_id?: number | null;
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
