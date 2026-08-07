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

export type GoalListStatusFilter = "All" | "Active" | "Paused" | "Completed";
export type GoalItemStatus = Exclude<GoalListStatusFilter, "All">;

export interface GoalListItemResponse {
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

