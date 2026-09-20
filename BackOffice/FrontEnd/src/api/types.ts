export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

// ─── Deploy ─────────────────────────────────────────────────────────────────
export type DeployTarget = "Frontend" | "Backend" | "Both";
export type DeploymentKind = "deploy" | "rollback";
export type DeploymentStatus = "running" | "success" | "failed" | "unknown";

export interface Deployment {
  id: number;
  label: string;
  description: string;
  target: DeployTarget;
  kind: DeploymentKind;
  git_ref: string;
  commit_sha: string | null;
  status: DeploymentStatus;
  log_output: string;
  triggered_by: string;
  started_at: string;
  completed_at: string | null;
}

export interface NewDeploymentRequest {
  label: string;
  description?: string;
  target: DeployTarget;
}

export interface RollbackRequest {
  commit_sha: string;
  description?: string;
}

export interface CommitInfo {
  sha: string;
  short_sha: string;
  author: string;
  date: string;
  message: string;
  is_current: boolean;
}

// ─── Database ───────────────────────────────────────────────────────────────
export type ColumnType = string; // backend reports SQLite's own type text (e.g. "INTEGER", "TEXT", "JSON")

export interface ColumnInfo {
  name: string;
  type: ColumnType;
  nullable: boolean;
  pk: boolean;
  fk: string | null;
}

export interface TableInfo {
  name: string;
  row_count: number;
  columns: ColumnInfo[];
}

export type Row = Record<string, unknown>;

export interface RowsResponse {
  columns: ColumnInfo[];
  rows: Row[];
  total: number;
  page: number;
  page_size: number;
}

export interface SqlQueryResponse {
  columns: string[];
  rows: Row[];
  rowcount: number;
}

// ─── Server ─────────────────────────────────────────────────────────────────
export interface WorkerInfo {
  pid: number;
  cpu_percent: number;
  memory_mb: number;
  uptime_seconds: number;
}

export interface ServerHealth {
  reachable: boolean;
  message: string | null;
  cpu_percent: number | null;
  memory_used_mb: number | null;
  memory_total_mb: number | null;
  memory_percent: number | null;
  disk_used_gb: number | null;
  disk_total_gb: number | null;
  disk_percent: number | null;
  battery_percent: number | null;
  battery_status: string | null;
  battery_temperature_c: number | null;
  workers: WorkerInfo[];
}

export type RestartStatus = "running" | "success" | "failed" | "unknown";

export interface RestartLog {
  id: number;
  trigger: string;
  initiated_by: string;
  status: RestartStatus;
  log_output: string;
  started_at: string;
  completed_at: string | null;
  duration_seconds: number | null;
}

// ─── Users ──────────────────────────────────────────────────────────────────
export type UserStatus = "active" | "away" | "inactive";

export interface AppUser {
  id: number;
  name: string;
  email: string;
  status: UserStatus;
  // Shadow V2's users have this; BackOffice's admins don't track it.
  email_verified: boolean | null;
  created_at: string;
}
