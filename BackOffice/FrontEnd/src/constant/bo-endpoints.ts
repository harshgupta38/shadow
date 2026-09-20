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
    detail:   (id: number) => `/deploy/${id}`,
  },
  DATABASE: {
    TABLES:  "/database/tables",
    QUERY:   "/database/query",
    BACKUPS: "/database/backups",
    rows:          (tableName: string) => `/database/tables/${encodeURIComponent(tableName)}/rows`,
    row:           (tableName: string) => `/database/tables/${encodeURIComponent(tableName)}/row`,
    backupFile:    (filename: string) => `/database/backups/${encodeURIComponent(filename)}`,
    backupRestore: (filename: string) => `/database/backups/${encodeURIComponent(filename)}/restore`,
  },
  SERVER: {
    HEALTH:          "/server/health",
    WORKERS:         "/server/workers",
    LOG:             "/server/log",
    RESTART:         "/server/restart",
    RESTART_HISTORY: "/server/restart-history",
    restartDetail:   (id: number) => `/server/restart/${id}`,
  },
  USERS: {
    SHADOW:     "/users/shadow",
    BACKOFFICE: "/users/backoffice",
  },
} as const;
