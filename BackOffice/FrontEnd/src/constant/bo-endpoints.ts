export const ENDPOINTS = {
  AUTH: {
    LOGIN:   "/auth/login",
    LOGOUT:  "/auth/logout",
    ME:      "/auth/me",
  },
  DEPLOY: {
    HISTORY:  "/deploy",
    NEW:      "/deploy/new",
    ROLLBACK: "/deploy/rollback",
    COMMITS:  "/deploy/commits",
    BRANCHES: "/deploy/branches",
    detail:   (id: number) => `/deploy/${id}`,
  },
  DATABASE: {
    TABLES:  "/database/tables",
    QUERY:   "/database/query",
    BACKUPS: "/database/backups",
    rows:          (tableName: string) => `/database/tables/${encodeURIComponent(tableName)}/rows`,
    row:           (tableName: string) => `/database/tables/${encodeURIComponent(tableName)}/row`,
    blob:          (tableName: string) => `/database/tables/${encodeURIComponent(tableName)}/blob`,
    backupFile:    (filename: string) => `/database/backups/${encodeURIComponent(filename)}`,
    backupRestore: (filename: string) => `/database/backups/${encodeURIComponent(filename)}/restore`,
    backupTables:  (filename: string) => `/database/backups/${encodeURIComponent(filename)}/tables`,
    backupRows:    (filename: string, tableName: string) =>
      `/database/backups/${encodeURIComponent(filename)}/tables/${encodeURIComponent(tableName)}/rows`,
    backupRow:     (filename: string, tableName: string) =>
      `/database/backups/${encodeURIComponent(filename)}/tables/${encodeURIComponent(tableName)}/row`,
  },
  SERVER: {
    HEALTH:          "/server/health",
    HEALTH_WS:       "/server/health/ws",
    WORKERS:         "/server/workers",
    LOG_WS:          "/server/log/ws",
    RESTART:         "/server/restart",
    RESTART_HISTORY: "/server/restart-history",
    restartDetail:   (id: number) => `/server/restart/${id}`,
  },
  USERS: {
    SHADOW:     "/users/shadow",
    BACKOFFICE: "/users/backoffice",
  },
} as const;
