export interface UserDataResponse {
  id: number;
  name: string;
  email: string;
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
  token_type: string;
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
  sunrise: string;
  sunset: string;
  next_transition_at: string;
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

export interface MessageLinkedItems {
  goal_proposals?: GoalProposal[];
  milestone_proposals?: MilestoneProposal[];
  task_proposals?: TaskProposal[];
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

// ── Planner ─────────────────────────────────────────────────────────────────
export type PlanPriority = "highest" | "high" | "medium" | "low" | "lowest";
export type PlanSourceType = "habit" | "task" | "schedule";
export type PlannerType = "simple" | "metric";
export type PlanPreferredTime = "flexible" | "morning" | "afternoon" | "evening" | "night" | "custom";
export type PlanStatus = "due" | "done" | "missed";

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

  allow_snoozing: boolean;
  snooze_limit: number | null; // null = infinite
  duration_minutes: number | null;
  note: string | null;

  category: GoalCategory | null;
  goal_id: number | null;
}

export interface ScheduledTaskUpdateRequest extends Partial<ScheduledTaskCreateRequest> { }

export interface ScheduledTaskDataResponse extends Omit<ScheduledTaskCreateRequest, "goal_id"> {
  id: number;
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
