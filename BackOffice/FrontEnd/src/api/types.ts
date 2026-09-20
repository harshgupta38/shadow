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

// Only set for JSON columns where BackEnd_V2's own model declares a
// specific shape — lets the row editor offer a structured list editor
// instead of a raw-text box for the shapes well-defined enough to build
// one for. Anything else (nested dicts, list[dict], etc.) stays a
// hardened-but-still-textual JSON editor.
export type JsonShape = "list_str" | "list_int" | "list" | "dict";

export interface ColumnInfo {
  name: string;
  type: ColumnType;
  nullable: boolean;
  pk: boolean;
  fk: string | null;
  json_shape: JsonShape | null;
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
  // null for a statement with no row set to page through (INSERT/UPDATE/
  // DELETE/DDL/...); set whenever the query was SELECT-shaped, even if
  // every row already fit in this one response.
  total: number | null;
  page: number;
  page_size: number;
}

export interface BackupInfo {
  name: string;
  created_at: string;
  size_bytes: number;
}

export interface RestoreBackupResponse {
  restored_from: string;
  pre_restore_backup: BackupInfo;
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

export interface CreateAdminRequest {
  current_password: string;
  name: string;
  email: string;
  password: string;
  secret_key: string;
}
