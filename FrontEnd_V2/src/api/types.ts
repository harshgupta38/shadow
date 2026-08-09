export interface UserData {
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

export interface UnderstandGoalRequest {
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

export interface UnderstandGoalResponse {
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
  refined_data: UnderstandGoalResponse;
  finish_reason: string;
  usage: TokenUsage | null;
  response_id: string | null;
  response_time_ms: number | null;
  cost: TokenCostBreakdown | null;
}

export type GoalListStatusFilter = "All" | "Active" | "Paused" | "Completed";
export type GoalItemStatus = Exclude<GoalListStatusFilter, "All">;

export interface GoalListItemResponse {
  id: number;
  title: string;
  summary: string;
  category: GoalCategory;
  status: GoalItemStatus;
  target_date: string;
  progress_percent: number;
  milestones_total: number;
  milestones_completed: number;
  habits_total: number;
  habits_active: number;
}

export interface GoalDetailResponse {
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
  progress_percent: number;
  milestones_total: number;
  milestones_completed: number;
  habits_total: number;
  habits_active: number;
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

export interface MilestoneResponse {
  id: number;
  goal_id: number;
  title: string;
  description: string | null;
  status: MilestoneStatus;

  reason: string | null;
  estimated_duration_days: number | null;

  started_at: string | null;
  paused_at: string | null;
  target_date: string | null;
  completed_at: string | null;

  position: number;
  created_at: string;
  created_by: MilestoneCreatedBy;
  assistant_context: Record<string, unknown> | null;

  total_tasks: number;
  completed_tasks: number;
}

