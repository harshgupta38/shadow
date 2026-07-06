/**
 * TypeScript types mirroring the Shadow backend Pydantic schemas.
 * Keep in sync with `BackEnd/app/schemas` and `BackEnd/app/models/enums.py`.
 */

// ── Enums (string unions match backend `str, enum.Enum` values) ────────────
export type ThemePreference = "browser" | "dynamic" | "light" | "dark";

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

export type MetricTimeSpan = "day" | "week" | "month" | "year" | "custom";

export type MetricType = "default" | "custom";

export type ActivitySource = "manual" | "integration";

export type PlannedTaskStatus = "planned" | "done" | "missed";
export type PlannedTaskSource = "manual" | "ai_generated" | "assistant";
export type PlannedTaskPriority = "critical" | "high" | "medium" | "low";

export type RepetitiveTaskPriority = "critical" | "high" | "medium" | "low";

export type RepetitiveTaskStatus = "active" | "paused" | "archived";

export type RepetitiveTaskFrequency =
  | "daily"
  | "weekly"
  | "monthly"
  | "weekdays"
  | "weekends"
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "first_of_month"
  | "end_of_month";

export type ReportPeriod = "daily" | "weekly";
export type ReportSource = "manual" | "automatic";
export type ReportAutomationWeekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

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
  verification_email_retry_after_seconds: number;
  subscription_plan: string;
  member_since: string;
  last_password_changed_at: string;
}

export interface EmailVerificationDispatch {
  detail: string;
  email_sent: boolean;
  verification_url_preview: string | null;
  retry_after_seconds: number;
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

export interface DynamicAppearanceResolveResponse {
  effective_theme: "light" | "dark";
  timezone: string;
  sunrise: string;
  sunset: string;
  next_transition_at: string;
  source: "open_meteo";
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
export interface MilestoneDetail {
  label: string;
  value: string;
}

export interface Milestone {
  id: number;
  goal_id: number;
  title: string;
  description: string | null;
  details: MilestoneDetail[] | null;
  status: MilestoneStatus;
  order: number;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface MilestoneCreate {
  title: string;
  description?: string | null;
  details?: MilestoneDetail[] | null;
  status?: MilestoneStatus;
  order?: number;
  due_date?: string | null;
}

export interface MilestoneUpdate {
  title?: string;
  description?: string | null;
  details?: MilestoneDetail[] | null;
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

export interface GoalDraftRequest {
  prompt: string;
}

export interface GoalDraft {
  title: string;
  description: string | null;
  category: string | null;
  target_date: string | null;
}

export interface GoalLinkedRepetitiveTask {
  id: number;
  name: string;
  description: string | null;
  frequencies: RepetitiveTaskFrequency[];
  category: string | null;
  priority: RepetitiveTaskPriority;
  status: RepetitiveTaskStatus;
  current_streak_days: number;
  max_streak_days: number;
}

// ── Repetitive tasks ──────────────────────────────────────────────────────
export interface RepetitiveTask {
  id: number;
  name: string;
  description: string | null;
  frequencies: RepetitiveTaskFrequency[];
  priority: RepetitiveTaskPriority;
  status: RepetitiveTaskStatus;
  linked_goal_ids: number[];
  linked_metric_ids: number[];
  created_at: string;
  updated_at: string;
}

export interface RepetitiveTaskCreate {
  name: string;
  description?: string | null;
  frequencies: RepetitiveTaskFrequency[];
  priority?: RepetitiveTaskPriority;
  linked_goal_ids?: number[];
  linked_metric_ids?: number[];
}

export interface RepetitiveTaskUpdate {
  name?: string;
  description?: string | null;
  frequencies?: RepetitiveTaskFrequency[];
  priority?: RepetitiveTaskPriority;
  status?: RepetitiveTaskStatus;
  linked_goal_ids?: number[];
  linked_metric_ids?: number[];
}

export interface RepetitiveTaskRecommendation {
  name: string;
  description: string;
  frequencies: RepetitiveTaskFrequency[];
  priority: RepetitiveTaskPriority;
  rationale: string;
  linked_goal_ids: number[];
  linked_metric_ids: number[];
}

// ── Chat ───────────────────────────────────────────────────────────────────
export interface ChatSession {
  id: number;
  agent_type: AgentType;
  title: string;
  goal_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface ChatSessionCreate {
  agent_type?: AgentType;
  title?: string;
  goal_id?: number;
}

export interface ChatMessage {
  id: number;
  session_id: number;
  role: ChatRole;
  content: string;
  agent_type: AgentType;
  created_at: string;
}

export interface ChatSendOptions {
  freshIntakeMode?: boolean;
}

export type AssistantActionModule = "plan" | "goals" | "track" | "repetitive_tasks";
export type AssistantActionConfidence = "high" | "medium" | "low";

export interface PlanCreateTaskActionArgs {
  title: string;
  date?: string | null;
  related_goal_id?: number | null;
  reminder_time?: string | null;
  estimated_duration_minutes?: number | null;
}

export interface GoalsCreateGoalActionArgs {
  title: string;
  description?: string | null;
  category?: string | null;
  target_date?: string | null;
}

export interface GoalsAddMilestoneActionArgs {
  goal_id: number;
  title: string;
  description?: string | null;
  details?: MilestoneDetail[] | null;
  order?: number;
  due_date?: string | null;
}

export interface TrackCreateMetricActionArgs {
  key: string;
  label: string;
  unit?: MetricUnit;
  unit_text?: string | null;
  time_span?: MetricTimeSpan;
  time_span_custom_text?: string | null;
  linked_habit_ids?: number[];
  target?: number | null;
}

export interface TrackLogMetricActionArgs {
  key: string;
  value: number;
  date?: string | null;
  note?: string | null;
}

export interface RepetitiveTasksCreateTaskActionArgs {
  name: string;
  description?: string | null;
  frequencies: RepetitiveTaskFrequency[];
  priority?: RepetitiveTaskPriority;
  linked_goal_ids?: number[];
  linked_metric_ids?: number[];
}

export interface AssistantProposedActionBase {
  id: string;
  module: AssistantActionModule;
  title: string;
  rationale: string;
  confidence: AssistantActionConfidence;
  requires_confirmation: boolean;
  destructive: boolean;
}

export interface PlanCreateTaskAction extends AssistantProposedActionBase {
  module: "plan";
  type: "plan.create_task";
  args: PlanCreateTaskActionArgs;
}

export interface GoalsCreateGoalAction extends AssistantProposedActionBase {
  module: "goals";
  type: "goals.create_goal";
  args: GoalsCreateGoalActionArgs;
}

export interface GoalsAddMilestoneAction extends AssistantProposedActionBase {
  module: "goals";
  type: "goals.add_milestone";
  args: GoalsAddMilestoneActionArgs;
}

export interface TrackCreateMetricAction extends AssistantProposedActionBase {
  module: "track";
  type: "track.create_metric";
  args: TrackCreateMetricActionArgs;
}

export interface TrackLogMetricAction extends AssistantProposedActionBase {
  module: "track";
  type: "track.log_metric";
  args: TrackLogMetricActionArgs;
}

export interface RepetitiveTasksCreateTaskAction extends AssistantProposedActionBase {
  module: "repetitive_tasks";
  type: "repetitive_tasks.create_task";
  args: RepetitiveTasksCreateTaskActionArgs;
}

export type AssistantProposedAction =
  | PlanCreateTaskAction
  | GoalsCreateGoalAction
  | GoalsAddMilestoneAction
  | TrackCreateMetricAction
  | TrackLogMetricAction
  | RepetitiveTasksCreateTaskAction;

export interface ChatActionExecuteResponse {
  status: "executed" | "rejected" | "failed";
  message: string;
  action: AssistantProposedAction;
  link?: string | null;
  entity_id?: number | null;
}

export interface ChatSendResponse {
  user_message: ChatMessage;
  assistant_message: ChatMessage;
  session: ChatSession;
  proposed_actions: AssistantProposedAction[];
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
  unit_text?: string;
  time_span?: MetricTimeSpan;
  time_span_custom_text?: string | null;
  type: MetricType;
  target: number | null;
  linked_habit_ids?: number[];
  active: boolean;
  created_at: string;
}

export interface MetricCreate {
  key: string;
  label: string;
  unit?: MetricUnit;
  unit_text?: string | null;
  time_span?: MetricTimeSpan;
  time_span_custom_text?: string | null;
  target?: number | null;
  linked_habit_ids?: number[];
}

export interface MetricDraftRequest {
  prompt: string;
}

export interface MetricDraft {
  label: string;
  unit_text: string;
  time_span: MetricTimeSpan;
  time_span_custom_text: string | null;
  target: number | null;
  rationale?: string | null;
}

export interface MetricUpdate {
  label?: string;
  unit?: MetricUnit;
  unit_text?: string | null;
  time_span?: MetricTimeSpan;
  time_span_custom_text?: string | null;
  target?: number | null;
  linked_habit_ids?: number[];
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

export interface ProgressCoachRecommendation {
  id: number;
  habit_id: number;
  habit_name: string;
  metric_name: string;
  metric_key: string;
  unit: MetricUnit;
  time_span: MetricTimeSpan;
  target: number;
  unit_hint: string | null;
  rationale: string;
  created_at: string;
}

export interface ProgressCoachRecommendationAcceptResponse {
  recommendation_id: number;
  habit_id: number;
  metric: TrackedMetric;
}

// ── Plan ───────────────────────────────────────────────────────────────────
export interface PlannedTask {
  id: number;
  title: string;
  date: string;
  reminder_time: string | null;
  estimated_duration_minutes: number | null;
  status: PlannedTaskStatus;
  source: PlannedTaskSource;
  priority: PlannedTaskPriority;
  ai_rationale: string | null;
  ai_impact_if_skipped: string | null;
  ai_confidence_score: number | null;
  suggested_start_time: string | null;
  suggested_finish_by_time: string | null;
  execution_order: number | null;
  carried_from_date: string | null;
  generated_at: string | null;
  related_goal_id: number | null;
  repetitive_task_id?: number | null;
  linked_metrics?: PlanTaskLinkedMetric[];
  category?: string | null;
  goal_title?: string | null;
  missed_yesterday?: boolean;
  overdue?: boolean;
  completed_late?: boolean;
  current_habit_streak?: number | null;
  previous_completion_history?: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface PlanTaskLinkedMetric {
  metric_id: number;
  label: string;
  unit_text: string;
  target: number | null;
  time_span: MetricTimeSpan;
  time_span_custom_text: string | null;
  logged_total: number;
  is_streak_style?: boolean;
}

export interface PlannedTaskCreate {
  title: string;
  date?: string | null;
  related_goal_id?: number | null;
  reminder_time?: string | null;
  estimated_duration_minutes?: number | null;
  source?: PlannedTaskSource;
  priority?: PlannedTaskPriority;
  ai_rationale?: string | null;
  ai_impact_if_skipped?: string | null;
  ai_confidence_score?: number | null;
  suggested_start_time?: string | null;
  suggested_finish_by_time?: string | null;
  execution_order?: number | null;
  carried_from_date?: string | null;
  generated_at?: string | null;
}

export interface PlannedTaskUpdate {
  title?: string;
  status?: PlannedTaskStatus;
  related_goal_id?: number | null;
  reminder_time?: string | null;
  estimated_duration_minutes?: number | null;
  source?: PlannedTaskSource;
  priority?: PlannedTaskPriority;
  ai_rationale?: string | null;
  ai_impact_if_skipped?: string | null;
  ai_confidence_score?: number | null;
  suggested_start_time?: string | null;
  suggested_finish_by_time?: string | null;
  execution_order?: number | null;
  carried_from_date?: string | null;
  generated_at?: string | null;
}

export interface PlannedTaskProgressUpdate {
  value: number;
  mode?: "add" | "set";
  metric_id?: number | null;
  note?: string | null;
}

export interface PlanGenerateRequest {
  on_date?: string | null;
}

export interface PlanExecutionItem {
  task_id: number;
  title: string;
  source: PlannedTaskSource;
  priority: PlannedTaskPriority;
  estimated_duration_minutes: number | null;
  suggested_start_time: string | null;
  suggested_finish_by_time: string | null;
}

export interface PlanInsights {
  missed_yesterday_count: number;
  missed_yesterday_titles: string[];
  carry_forward_count: number;
  carry_forward_titles: string[];
  highest_priority_task_title: string | null;
  highest_priority_message: string | null;
  estimated_tasks_count: number;
  estimated_workload_minutes: number;
  workload_label: string;
  habit_streak_summary: PlanHabitStreakItem[];
}

export interface PlanHabitStreakItem {
  task_title: string;
  highest_streak_days: number;
  current_streak_days: number;
  completion_rate_percent: number;
  last_completed_days_ago: number | null;
  at_risk: boolean;
}

export interface PlanWorkspace {
  date: string;
  tasks: PlannedTask[];
  insights: PlanInsights;
  execution_order: PlanExecutionItem[];
  generated_at: string | null;
}

// ── Reports ────────────────────────────────────────────────────────────────
export interface Report {
  id: number;
  period: ReportPeriod;
  source: ReportSource;
  period_start: string;
  period_end: string;
  metrics_json: ReportMetricsJson;
  narrative: string | null;
  next_steps: string | null;
  created_at: string;
}

export interface ReportHistoryCard {
  history_date: string;
  versions_count: number;
  latest_report_id: number;
  latest_period: ReportPeriod;
  latest_created_at: string;
  latest_narrative_snippet: string | null;
  report_periods: ReportPeriod[];
}

export interface ReportAutomation {
  enabled: boolean;
  daily_enabled: boolean;
  daily_time: string;
  weekly_enabled: boolean;
  weekly_day: ReportAutomationWeekday;
  weekly_time: string;
  include_plan_snapshot: boolean;
  include_goals_snapshot: boolean;
  include_habits_snapshot: boolean;
  include_metrics_snapshot: boolean;
  include_missed_tasks_snapshot: boolean;
  include_streaks_snapshot: boolean;
  selected_metric_ids: number[];
  selected_habit_ids: number[];
}

export interface ReportAutomationUpdate {
  enabled?: boolean;
  daily_enabled?: boolean;
  daily_time?: string;
  weekly_enabled?: boolean;
  weekly_day?: ReportAutomationWeekday;
  weekly_time?: string;
  include_plan_snapshot?: boolean;
  include_goals_snapshot?: boolean;
  include_habits_snapshot?: boolean;
  include_metrics_snapshot?: boolean;
  include_missed_tasks_snapshot?: boolean;
  include_streaks_snapshot?: boolean;
  selected_metric_ids?: number[];
  selected_habit_ids?: number[];
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
