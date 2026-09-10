export interface UserDataResponse {
  id: number;
  name: string;
  email: string;
  theme_preference: ThemePreference;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest extends LoginRequest {
  name: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface RefreshRequest {
  refresh_token: string;
}

export interface ChildProps {
  children?: React.ReactNode;
}

export interface ApiErrorShape {
  message: string;
  status?: number;
  fieldErrors?: Record<string, string>;
}

export interface FieldError {
  message?: string;
  errors?: Record<string, string>;
}

export type ThemePreference = "browser" | "dynamic" | "light" | "dark";
// Only light and dark can be effective, rest are just options that resolved to light/dark
export type EffectiveTheme = Exclude<ThemePreference, "browser" | "dynamic">;

export interface DynamicThemeResponse {
  effective_theme: EffectiveTheme;
  // null when the sunrise-sunset.org lookup failed and the backend fell back to a
  // simple clock heuristic instead of failing the whole request.
  sunrise: string | null;
  sunset: string | null;
  next_transition_at: string | null;
}

export interface UserLocation {
  latitude: number;
  longitude: number;
}

export interface RefineGoalRequest {
  goal: string;
  why: string;
  success: string;
  reality: string;
  obstacles: string;
}

export type GoalCategory =
  | "Career"
  | "Business"
  | "Finance"
  | "Health"
  | "Fitness"
  | "Education"
  | "Relationships"
  | "Productivity"
  | "Personal Growth"
  | "Travel"
  | "Other";

export interface RefineGoalFromLLMSchema {
  title: string;
  summary: string;
  category: GoalCategory;
  motivation: string;
  success_definition: string;
  current_state: string;
  challenges: string[];
  strengths: string[];
  target_date: string;
  success_metrics: string[];
  insights: string[];
}

export interface TokenUsage {
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
}

export interface TokenCostBreakdown {
  input_token_cost: number;
  output_token_cost: number;
  total_cost: number;
}

export interface RefineGoalResponse {
  provider: string;
  model: string;
  model_str: string | null;
  refined_data: RefineGoalFromLLMSchema;
  finish_reason: string;
  usage: TokenUsage | null;
  response_id: string | null;
  response_time_ms: number | null;
  cost: TokenCostBreakdown | null;
}

export type GoalListStatusFilter = "All" | "Active" | "Paused" | "Completed";
export type GoalItemStatus = Exclude<GoalListStatusFilter, "All">;

export interface GoalDataShortResponse {
  id: number;
  position: number;
  title: string;
  summary: string;
  category: GoalCategory;
  status: GoalItemStatus;
  target_date: string;
  milestones_total: number;
  milestones_completed: number;
  habits_total: number;
  habits_active: number;
}

export interface GoalReorderItem {
  id: number;
  position: number;
}

export interface GoalReorderRequest {
  goals: GoalReorderItem[];
}

export interface GoalDataResponse {
  id: number;
  title: string;
  summary: string;
  category: GoalCategory;
  status: GoalItemStatus;
  motivation: string;
  success_definition: string;
  current_state: string;
  challenges: string[];
  strengths: string[];
  target_date: string;
  success_metrics: string[];
  insights: string[];
  source_conversation_id: number | null;
  milestones_total: number;
  milestones_completed: number;
  habits_total: number;
  habits_active: number;
}

export type ProposalStatus = "pending" | "saved";
export type ProposalAction = "create" | "view";

export interface GoalProposal {
  proposal_id: string;
  content_index: number;
  status: ProposalStatus;
  goal_id: number | null;
  goal: RefineGoalFromLLMSchema;
  goal_action: ProposalAction;
}

export interface SaveGoalFromProposalRequest {
  proposal_id: string;
  goal: RefineGoalFromLLMSchema;
}

export interface MilestoneProposalLLMSchema {
  title: string;
  description: string | null;
  reason: string;
  estimated_duration_days: number | null;
  assistant_context: string | null;
}

export interface MilestoneProposal {
  proposal_id: string;
  content_index: number;
  status: ProposalStatus;
  goal_id: number | null;
  milestone_id: number | null;
  milestone: MilestoneProposalLLMSchema;
  milestone_action: ProposalAction;
}

export interface SaveMilestoneFromProposalRequest {
  proposal_id: string;
  milestone: MilestoneProposalLLMSchema;
}

export type MilestoneCreatedBy = "User" | "Assistant";
export type MilestoneStatus = "Not Started" | "In Progress" | "Paused" | "Completed" | "Cancelled";

export interface MilestoneCreateRequest {
  goal_id: number;
  title: string;
  description: string | null;
  reason: string | null;
  estimated_duration_days: number | null;
  created_by: MilestoneCreatedBy;
  assistant_context: Record<string, unknown> | null;
}

export interface MilestoneUpdateRequest {
  title?: string;
  description?: string | null;
  status?: MilestoneStatus;
  reason?: string | null;
  estimated_duration_days?: number | null;
  target_date?: string | null;
  position?: number;
}

export interface MilestoneDataResponse {
  id: number;
  goal_id: number;
  title: string;
  description: string | null;
  status: MilestoneStatus;

  reason: string | null;
  estimated_duration_days: number | null;

  started_at: string | null;
  paused_at: string | null;
  cancelled_at: string | null;
  target_date: string | null;
  completed_at: string | null;

  position: number;
  created_at: string;
  created_by: MilestoneCreatedBy;
  assistant_context: Record<string, unknown> | null;

  total_tasks: number;
  completed_tasks: number;
}

export type TaskType = "Numeric" | "Binary";
export type TaskPlannerType = "simple" | "metric";
export type TaskPriority = "highest" | "high" | "medium" | "low" | "lowest";
export type TaskPreferredTime = "flexible" | "morning" | "afternoon" | "evening" | "night" | "custom";
export type TaskCreatedBy = "User" | "Assistant";
export type TaskStatus = "Not Started" | "In Progress" | "Paused" | "Completed" | "Cancelled";

// Scheduling fields shared between task create/update/response — mirrors Habit model.
interface TaskSchedulingFields {
  frequencies: string[];
  priority: TaskPriority;
  preferred_time: TaskPreferredTime;
  specific_time: string | null;
  duration_minutes: number | null;
  weekly_count: number | null;
  monthly_count: number | null;
  specific_days: number[] | null;
  day_fallback: boolean;
}

export interface TaskCreateRequest extends TaskSchedulingFields {
  goal_id: number;
  milestone_id: number;
  title: string;
  task_type: TaskType;

  // Numeric-task progress fields — null for Binary tasks.
  current_value: number | null;
  target_value: number | null;
  value_unit: string | null;

  planning_enabled: boolean;
  planner_type: TaskPlannerType;
  planner_target: number | null;

  assistant_context: Record<string, unknown> | null;
  note: string | null;
}

export interface TaskUpdateRequest extends Partial<TaskSchedulingFields> {
  title?: string;
  task_type?: TaskType;
  status?: TaskStatus;

  current_value?: number | null;
  target_value?: number | null;
  value_unit?: string | null;

  planning_enabled?: boolean;
  planner_type?: TaskPlannerType;
  planner_target?: number | null;

  note?: string | null;
  position?: number;
}

export interface TaskDataResponse extends TaskSchedulingFields {
  id: number;
  goal_id: number;
  milestone_id: number;
  title: string;
  task_type: TaskType;

  current_value: number | null;
  target_value: number | null;
  value_unit: string | null;

  status: TaskStatus;
  planning_enabled: boolean;
  planner_type: TaskPlannerType;
  planner_target: number | null;

  assistant_context: Record<string, unknown> | null;
  note: string | null;

  position: number;
  created_at: string;
  created_by: TaskCreatedBy;
  started_at: string | null;
  paused_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
}

export type AssistantAgentType = "shadow" | "goal_coach" | "career_advisor" | "insights";
export type ChatRole = "user" | "assistant" | "system" | "tool";

export interface ConvoDataShortResponse {
  id: number;
  title: string;
  agent_type: AssistantAgentType;

  created_at: string;
  updated_at: string;

  is_local?: boolean;
}

export interface TaskProposalLLMSchema {
  title: string;
  task_type: TaskType;
  target_value: number | null;
  value_unit: string | null;
  note: string | null;
  assistant_context: string;
}

export interface TaskProposal {
  proposal_id: string;
  content_index: number;
  status: ProposalStatus;
  goal_id: number | null;
  milestone_id: number | null;
  task_id: number | null;
  task: TaskProposalLLMSchema;
  task_action: ProposalAction;
}

export interface SaveTaskFromProposalRequest {
  proposal_id: string;
  task: TaskCreateRequest;
}

export interface ScheduledTaskProposalLLMSchema {
  title: string;
  scheduled_date: string;
  priority: ScheduledTaskPriority;
  planner_type: ScheduledTaskType;
  planner_target: number | null;
  value_unit: string | null;
  preferred_time: ScheduledTaskPreferredTime;
  specific_time: string | null;
  allow_snoozing: boolean;
  snooze_limit: number | null;
  duration_minutes: number | null;
  note: string | null;
  category: string | null;
  goal_id: number | null;
  assistant_context: string;
}

export interface ScheduledTaskProposal {
  proposal_id: string;
  content_index: number;
  status: ProposalStatus;
  scheduled_task_id: number | null;
  scheduled_task: ScheduledTaskProposalLLMSchema;
  scheduled_task_action: ProposalAction;
}

export interface SaveScheduledTaskFromProposalRequest {
  proposal_id: string;
  task: ScheduledTaskCreateRequest;
}

export interface MessageLinkedItems {
  goal_proposals?: GoalProposal[];
  milestone_proposals?: MilestoneProposal[];
  task_proposals?: TaskProposal[];
  scheduled_task_proposals?: ScheduledTaskProposal[];
}

export interface MessageDataResponse {
  id?: number;
  conversation_id: number;
  content: string[];
  role: ChatRole;
  request_status: string;
  linked_items: MessageLinkedItems;
  created_at: string;
}

export interface MessageChunkResponse {
  message_list: MessageDataResponse[];
  has_more: boolean;
}

interface ExtraDataInRequest {
  goal_id?: number;
  milestone_id?: number;
}

export interface NewConvoRequest extends ExtraDataInRequest {
  content: string;
  agent_type: AssistantAgentType;
}

export interface MessageRequest extends ExtraDataInRequest {
  conversation_id: number;
  content: string;
}

export interface RenameConvoRequest {
  title: string;
}

export interface MessageResponse {
  message_data: MessageDataResponse;
  conversation_data?: ConvoDataShortResponse;
}

export interface RegenerateResponseRequest {
  conversation_id: number;
  message_id: number;
}

export interface RetryFailedMessageRequest {
  conversation_id: number;
  message_id: number;
}

export type HabitStatus = "active" | "paused" | "archived";
export type HabitPriority = "highest" | "high" | "medium" | "low" | "lowest";
export type HabitType = "simple" | "metric";
export type HabitPreferredTime = "flexible" | "morning" | "afternoon" | "evening" | "night" | "custom";
export type FilterState = { status: string[]; priority: string[]; frequency: string[] };

export interface HabitCreateRequest {
  title: string;
  planner_type: HabitType;

  planner_target: number | null;
  value_unit: string | null;
  priority: HabitPriority;
  frequencies: string[];
  weekly_count: number | null;
  monthly_count: number | null;
  specific_days: number[] | null;
  day_fallback: boolean;

  start_date: string | null;
  end_date: string | null;

  preferred_time: HabitPreferredTime;
  specific_time: string | null;
  duration_minutes: number | null;
  note: string | null;
  goal_id: number | null;
  category: GoalCategory | null;
}

export interface HabitDataResponse extends Omit<HabitCreateRequest, "goal_id"> {
  id: number;
  goal?: GoalDataInPlan;
  status: HabitStatus;
  current_streak: number;
  max_streak: number;
  created_at: string;
  updated_at: string;
}

export interface HabitUpdateRequest extends Partial<HabitCreateRequest> {
  status?: HabitStatus;
}

export interface HabitHistoryStats {
  total_records: number;
  total_done: number;
  total_missed: number;
  completion_rate: number; // 0.0 – 1.0
}

// ── Planner ─────────────────────────────────────────────────────────────────
export type PlanPriority = "highest" | "high" | "medium" | "low" | "lowest";
export type PlanSourceType = "habit" | "task" | "schedule";
export type PlannerType = "simple" | "metric";
export type PlanPreferredTime = "flexible" | "morning" | "afternoon" | "evening" | "night" | "custom";
export type PlanStatus = "due" | "done" | "missed";

export interface HabitActivityRecord {
  date: string; // YYYY-MM-DD
  status: PlanStatus;
  value: number | null;
  note: string | null;
  streak: number;
}

export interface HabitActivityResponse {
  habit: HabitDataResponse;
  records: HabitActivityRecord[];
}

export type TaskActivityRecord = HabitActivityRecord;

export interface TaskActivityResponse {
  task: TaskDataResponse;
  goal_title: string | null;
  records: TaskActivityRecord[];
}

export interface PlanDataResponse {
  plan_id: number;
  source_type: PlanSourceType;
  source_id: number;
  title: string;
  planner_type: PlannerType;
  planner_target: number | null;
  value_unit: string | null;
  priority: PlanPriority;
  preferred_time: PlanPreferredTime;
  specific_time: string | null;
  duration_minutes: number | null;

  // Goal-linked fields — populated when the source habit/task is linked to a goal
  goal?: GoalDataInPlan;

  saved_data: DailyPlanSavedData | null;
}

export interface GoalDataInPlan {
  id: number;
  title: string;
  category: GoalCategory | null;
}

export interface DailyPlanSavedData {
  record_id: number | null; // null for synthesized missed occurrences (no DB record)
  status: PlanStatus;
  current_value: number;
  current_streak: number; // computed from recurrence + history, never stored
  max_streak: number;     // computed from recurrence + history, never stored
  note: string;
}

export interface UpdatePlanRequest {
  status?: PlanStatus;
  actual_value?: number;
  note?: string;
}

export interface PlanResponse {
  items: PlanDataResponse[];
  // The prior day's daily-report closing message (relative to the requested date),
  // if one was generated — null when no report exists yet for that date.
  previous_day_closing: DailyReportDetail["closing"] | null;
}

// ── Scheduled Tasks ──────────────────────────────────────────────────────────
export type ScheduledTaskType = "simple" | "metric";
export type ScheduledTaskPriority = "highest" | "high" | "medium" | "low" | "lowest";
export type ScheduledTaskPreferredTime = "flexible" | "morning" | "afternoon" | "evening" | "night" | "custom";
export type ScheduledTaskStatus = "upcoming" | "completed" | "snoozed" | "missed";

export interface ScheduledTaskCreateRequest {
  title: string;
  planner_type: ScheduledTaskType;

  planner_target: number | null;
  value_unit: string | null;
  priority: ScheduledTaskPriority;
  scheduled_date: string; // YYYY-MM-DD
  preferred_time: ScheduledTaskPreferredTime;
  specific_time: string | null;
  repeat_yearly?: boolean; // true → saved to yearly_tasks; false/omitted → scheduled_tasks

  allow_snoozing: boolean;
  snooze_limit: number | null; // null = infinite
  duration_minutes: number | null;
  note: string | null;

  category: GoalCategory | null;
  goal_id: number | null;
}

export interface ScheduledTaskUpdateRequest extends Partial<ScheduledTaskCreateRequest> { }

export interface ScheduledTaskDataResponse extends Omit<ScheduledTaskCreateRequest, "goal_id" | "repeat_yearly"> {
  id: number;
  repeat_yearly: boolean; // true if from yearly_tasks — derived from table membership, not a stored column
  goal?: GoalDataInPlan;
  status: ScheduledTaskStatus;
  created_at: string;
  updated_at: string;
}

// ── Track Progress ──────────────────────────────────────────────────────────

export type ColorKey = "success" | "info" | "brand" | "warn" | "violet";

interface HabitBaseData {
  id: number;
  title: string;
  category: GoalCategory | null;
  current_streak: number;
  max_streak: number;
  done_today: boolean;
  color: ColorKey;
};

export interface HabitTrackItem extends HabitBaseData {
  planner_type: HabitType;
  planner_target: number | null;
  value_unit: string | null;
  /** 7 integers — index 0 = Sunday, index 6 = Saturday; simple=0|1, metric=actual_value, future=0 */
  history: number[];
  current_value: number;
}

export interface EligibleHabitItem {
  id: number;
  title: string;
  category: GoalCategory | null;
  priority: HabitPriority;
  planner_type: HabitType;
}

export interface EligibleTaskItem {
  id: number;
  title: string;
  priority: TaskPriority;
  planner_type: TaskPlannerType;
  tracking_enabled: boolean;
}

export interface TaskTrackItem {
  id: number;
  title: string;
  planner_type: TaskPlannerType;
  planner_target: number | null;
  value_unit: string | null;
  current_streak: number;
  max_streak: number;
  history: number[];
  done_today: boolean;
  current_value: number;
  color: ColorKey;
}

export interface MetricHabitData extends HabitBaseData {
  value_unit: string;
  planner_target: number;
  /** 7 entries — index 0 = Sunday, index 6 = Saturday of the current week */
  history: number[];
  current_value: number;
}

export interface SimpleHabitData extends HabitBaseData {
  /** 7 entries — index 0 = Sunday, index 6 = Saturday of the current week */
  history: boolean[];
}

// ── Notifications ────────────────────────────────────────────────────────────

export type NotificationType = "reminder" | "system" | "agent";

export interface Notification {
  id: number;
  title: string;
  body: string | null;
  type: NotificationType;
  read: boolean;
  created_at: string;
  url?: string;
}

// ── Reports ───────────────────────────────────────────────────────────────────

export interface DayReport {
  date: string;             // "YYYY-MM-DD"
  score: number | null;     // null when no plan records exist for the date
  alignment_score: number | null; // from latest report; null when no report exists
  habits_total: number;
  habits_done: number;
  tasks_total: number;
  tasks_done: number;
  schedule_total: number;
  schedule_done: number;
  has_daily_report: boolean;
  has_weekly_report: boolean;
}

export interface MonthlyReportResponse {
  days: DayReport[];
}

export interface GoalAlignment {
  id: number;
  title: string;
  alignment_pct: number;
  milestone_title: string;
  note: string;
  tasks_done: number;
  tasks_total: number;
}

export interface DailyReportDetail {
  date: string;
  report_type: "daily" | "weekly";
  generated_at: string;
  alignment_score: number;
  headline: string;
  summary: string;
  stats: {
    tasks_done: number;
    tasks_total: number;
    habits_done: number;
    habits_total: number;
    best_streak: number;
  };
  goals: GoalAlignment[];
  highlights: { good: string[]; attention: string[] };
  closing: { tone: "motivate" | "guide" | "celebrate"; message: string };
}

// ── Dashboard ──────────────────────────────────────────────────────────────────

// A single habit's Sun–Sat completion row, used by both TrackProgressPage's
// weekly matrix and the Dashboard's "This Week" panel.
export interface WeeklyMatrixRow {
  id: number;
  title: string;
  week: boolean[];
}

// Shaped specifically for the Dashboard's today-snapshot preview — not a reuse
// of PlanDataResponse, since the widget only ever needs a goal's summary line
// (never its title/category/id) and never touches duration, notes, or streak max.
export interface DashboardTodayItem {
  plan_id: number;
  source_type: "habit" | "task" | "schedule";
  title: string;
  planner_type: "simple" | "metric";
  planner_target: number | null;
  value_unit: string | null;
  priority: PlanPriority;
  preferred_time: PlanPreferredTime;
  specific_time: string | null;
  goal_summary: string | null;
  status: "due" | "done";
  current_value: number;
  current_streak: number;
}

export interface DashboardUpcomingItem {
  id: number;
  // scheduled_tasks and yearly_tasks are separate tables with their own id
  // sequences, so an id can collide across the two — use id+repeat_yearly
  // together as the unique key (same pattern SchedulePage already uses).
  repeat_yearly: boolean;
  title: string;
  scheduled_date: string; // YYYY-MM-DD
  priority: ScheduledTaskPriority;
  note: string | null;
}

// Single-endpoint contract for the Dashboard — every widget's data is a slice
// of this one response, no per-widget requests.
export interface DashboardResponse {
  today_items: DashboardTodayItem[];
  latest_report: DailyReportDetail | null; // null when no report has ever been generated
  month_days: DayReport[];
  goals: GoalDataShortResponse[];
  upcoming: DashboardUpcomingItem[];
  week_habits: WeeklyMatrixRow[];
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export type ThemePreferenceValue = ThemePreference;
export type AIResponseLength = "short" | "balanced" | "detailed" | "very_detailed";
export type AIPersonality = "professional" | "friendly" | "coach" | "teacher" | "mentor" | "minimal";
export type WeekStartsOn = "monday" | "sunday";
export type TimeFormat = "12h" | "24h";
export type DateFormat =
  | "dd/mm/yyyy"
  | "mm/dd/yyyy"
  | "dd-mm-yyyy"
  | "mm-dd-yyyy"
  | "mmm d yyyy"
  | "yyyy-mm-dd";

export interface AIModel {
  name: string;
  key: string;
}

export interface AIProvider {
  name: string;
  key: string;
  models: AIModel[];
}

export interface AppearanceSettings {
  theme_preference: ThemePreferenceValue;
}

export interface NotificationSettings {
  notifications_enabled: boolean;
  push_notifications_enabled: boolean;
  email_notifications_enabled: boolean;
  reminder_notifications_enabled: boolean;
  daily_brief_enabled: boolean;
  daily_brief_time: string;
  weekly_summary_enabled: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  quiet_hours_allow_urgent: boolean;
}

export interface AIBehaviorSettings {
  ai_response_length: AIResponseLength;
  ai_personality: AIPersonality;
  ai_provider: string;
  ai_default_model: string;
}

export interface PlannerSettings {
  week_starts_on: WeekStartsOn;
  default_reminder_time: string;
  default_task_duration_minutes: number;
  time_format: TimeFormat;
  date_format: DateFormat;
}

export interface PrivacySettings {
  ai_memory_enabled: boolean;
}

export interface AccessibilitySettings {
  accessibility_reduced_motion: boolean;
  accessibility_high_contrast: boolean;
  accessibility_font_scale_percent: number;
}

export interface FullSettings {
  appearance: AppearanceSettings;
  notifications: NotificationSettings;
  ai_behavior: AIBehaviorSettings;
  planner: PlannerSettings;
  privacy: PrivacySettings;
  accessibility: AccessibilitySettings;
}
