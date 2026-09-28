export const ENDPOINTS = {
  AUTH: {
    LOGIN:   "/auth/login",
    LOGOUT:  "/auth/logout",
    ME:      "/auth/me",
  },
  DEPLOY: {
    history:  (app: string) => `/deploy/${app}`,
    new:      (app: string) => `/deploy/${app}/new`,
    rollback: (app: string) => `/deploy/${app}/rollback`,
    commits:  (app: string) => `/deploy/${app}/commits`,
    branches: (app: string) => `/deploy/${app}/branches`,
    detail:   (app: string, id: number) => `/deploy/${app}/${id}`,
  },
  DATABASE: {
    tables:  (app: string) => `/database/${app}/tables`,
    query:   (app: string) => `/database/${app}/query`,
    backups: (app: string) => `/database/${app}/backups`,
    rows:          (app: string, tableName: string) => `/database/${app}/tables/${encodeURIComponent(tableName)}/rows`,
    row:           (app: string, tableName: string) => `/database/${app}/tables/${encodeURIComponent(tableName)}/row`,
    blob:          (app: string, tableName: string) => `/database/${app}/tables/${encodeURIComponent(tableName)}/blob`,
    backupFile:    (app: string, filename: string) => `/database/${app}/backups/${encodeURIComponent(filename)}`,
    backupRestore: (app: string, filename: string) => `/database/${app}/backups/${encodeURIComponent(filename)}/restore`,
    backupTables:  (app: string, filename: string) => `/database/${app}/backups/${encodeURIComponent(filename)}/tables`,
    backupRows:    (app: string, filename: string, tableName: string) =>
      `/database/${app}/backups/${encodeURIComponent(filename)}/tables/${encodeURIComponent(tableName)}/rows`,
    backupRow:     (app: string, filename: string, tableName: string) =>
      `/database/${app}/backups/${encodeURIComponent(filename)}/tables/${encodeURIComponent(tableName)}/row`,
  },
  SERVER: {
    health:         (app: string) => `/server/${app}/health`,
    healthWs:       (app: string) => `/server/${app}/health/ws`,
    workers:        (app: string) => `/server/${app}/workers`,
    logWs:          (app: string) => `/server/${app}/log/ws`,
    restart:        (app: string) => `/server/${app}/restart`,
    restartHistory: (app: string) => `/server/${app}/restart-history`,
    restartDetail:  (app: string, id: number) => `/server/${app}/restart/${id}`,
  },
  USERS: {
    SHADOW:     "/users/shadow",
    BACKOFFICE: "/users/backoffice",
    shadowDelete: (userId: number) => `/users/shadow/${userId}`,
  },
  DELETED_DATA: {
    tables: () => `/deleted-data/tables`,
    rows:   (tableName: string) => `/deleted-data/tables/${encodeURIComponent(tableName)}/rows`,
    row:    (tableName: string) => `/deleted-data/tables/${encodeURIComponent(tableName)}/row`,
  },
} as const;
