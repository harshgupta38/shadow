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

export type GoalProposalStatus = "pending" | "saved";
export type GoalProposalAction = "create" | "view";

export interface GoalProposal {
  proposal_id: string;
  content_index: number;
  status: GoalProposalStatus;
  goal_id: number | null;
  goal: RefineGoalFromLLMSchema;
  goal_action: GoalProposalAction;
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
  target_date: string | null;
}

export type MilestoneProposalStatus = "pending" | "saved";
export type MilestoneProposalAction = "create" | "view";

export interface MilestoneProposal {
  proposal_id: string;
  content_index: number;
  status: MilestoneProposalStatus;
  goal_id: number | null;
  milestone_id: number | null;
  milestone: MilestoneProposalLLMSchema;
  milestone_action: MilestoneProposalAction;
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
export type TaskPlanningMethod = "Daily" | "Weekly" | "Monthly";
export type TaskCreatedBy = "User" | "Assistant";
export type TaskStatus = "Not Started" | "In Progress" | "Paused" | "Completed" | "Cancelled";

export interface TaskCreateRequest {
  goal_id: number;
  milestone_id: number;
  title: string;
  task_type: TaskType;

  current_value: number | null;
  target_value: number | null;
  value_unit: string | null;

  planning_enabled: boolean;
  planning_method: TaskPlanningMethod | null;
  planner_target: number | null;
  planning_start_date: string | null;
  start_with_milestone: boolean;
  planning_end_date: string | null;
  end_with_milestone: boolean;

  assistant_context: Record<string, unknown> | null;
  note: string | null;
}

export interface TaskUpdateRequest {
  title?: string;
  status?: TaskStatus;

  current_value?: number | null;
  target_value?: number | null;
  value_unit?: string | null;

  planning_enabled?: boolean;
  planning_method?: TaskPlanningMethod | null;
  planner_target?: number | null;
  planning_start_date?: string | null;
  start_with_milestone?: boolean;
  planning_end_date?: string | null;
  end_with_milestone?: boolean;

  note?: string | null;
  position?: number;
}

export interface TaskDataResponse {
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
  planning_method: TaskPlanningMethod | null;
  planner_target: number | null;
  planning_start_date: string | null;
  start_with_milestone: boolean;
  planning_end_date: string | null;
  end_with_milestone: boolean;

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

export interface MessageLinkedItems {
  goal_proposals?: GoalProposal[];
  milestone_proposals?: MilestoneProposal[];
}

export interface MessageDataResponse {
  id?: number;
  conversation_id: number;
  content: string[];
  role: ChatRole;
  linked_items: MessageLinkedItems;
  created_at: string;
}

export interface MessageChunkResponse {
  message_list: MessageDataResponse[];
  has_more: boolean;
}

export interface NewConvoRequest {
  content: string;
  agent_type: AssistantAgentType;
}

export interface MessageRequest {
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