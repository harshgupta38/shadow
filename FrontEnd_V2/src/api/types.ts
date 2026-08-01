export interface UserData {
  id: number;
  name: string;
  email: string;

  onboarding_completed: boolean;
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

export type Gender = "male" | "female" | "";

export interface FoundationData {
  name: string;
  gender: Exclude<Gender, "">;

  birthDay: string;
  birthMonth: string;
  birthYear: string;
}