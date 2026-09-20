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
    TABLES: "/database/tables",
    QUERY:  "/database/query",
    rows:   (tableName: string) => `/database/tables/${encodeURIComponent(tableName)}/rows`,
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
