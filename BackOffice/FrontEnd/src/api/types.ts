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
  // Branch name, tag, or commit SHA — required; the backend resolves
  // which one it is to decide whether to pull (branch) or just check it
  // out directly (tag/SHA).
  git_ref: string;
  // Blank defaults to git_ref on the backend.
  label?: string;
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

export interface BranchesResponse {
  branches: string[];
  // null when HEAD is detached (right after a rollback, or after
  // deploying a tag/commit SHA) — there simply isn't a current branch.
  current: string | null;
}

// ─── Database ───────────────────────────────────────────────────────────────
export type ColumnType = string; // backend reports SQLite's own type text (e.g. "INTEGER", "TEXT", "JSON")

// Only set for JSON columns where BackEnd_V2's own model declares a
// specific shape — lets the row editor pick the right structured widget:
// "list_str"/"list_int" get a flat list editor, "list"/"dict" (or a JSON
// column with no resolvable shape) get a breadcrumb-navigable tree editor.
// Either way, the admin never edits raw JSON text.
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

export interface DeleteBackupResponse {
  deleted: string;
}

// ─── Server ─────────────────────────────────────────────────────────────────
export interface WorkerInfo {
  pid: number;
  // Each can fail independently (some /proc reads are permission-denied
  // on some Termux/Android setups) — a worker still shows up with its
  // PID even if none of its other metrics could be read.
  cpu_percent: number | null;
  memory_mb: number | null;
  uptime_seconds: number | null;
}

export interface ServerHealth {
  reachable: boolean;
  message: string | null;
  cpu_percent: number | null;
  // [1min, 5min, 15min] load average — a second, independent CPU signal
  // alongside cpu_percent above.
  load_average: number[] | null;
  memory_used_mb: number | null;
  memory_total_mb: number | null;
  memory_percent: number | null;
  disk_used_gb: number | null;
  disk_total_gb: number | null;
  disk_percent: number | null;
  battery_percent: number | null;
  battery_status: string | null;
  battery_temperature_c: number | null;
  battery_plugged: string | null;
  // null for any of these means no WiFi (mobile data, or disconnected) —
  // not an error, just nothing to show.
  wifi_ssid: string | null;
  wifi_ip: string | null;
  wifi_rssi: number | null;
  wifi_link_speed_mbps: number | null;
  workers: WorkerInfo[];
  // The uvicorn arbiter's configured --workers count, reported by
  // BackEnd_V2 itself — compare against workers.length (this process's
  // own count) to tell "fewer workers than intended" apart from "this
  // server only ever runs N."
  expected_workers: number | null;
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
