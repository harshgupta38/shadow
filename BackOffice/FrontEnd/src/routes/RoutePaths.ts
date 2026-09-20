export const ROUTES = {
  LOGIN:    "/login",
  HOME:     "/",

  SHADOW_USERS:      "/shadow/users",
  SHADOW_DATABASE:   "/shadow/database",
  SHADOW_DEPLOYMENT: "/shadow/deployment",
  SHADOW_SERVER:     "/shadow/server",
  SHADOW_LOGS:       "/shadow/logs",

  BACKOFFICE_USERS:      "/backoffice/users",
  BACKOFFICE_DATABASE:   "/backoffice/database",
  BACKOFFICE_DEPLOYMENT: "/backoffice/deployment",
  BACKOFFICE_SERVER:     "/backoffice/server",
  BACKOFFICE_LOGS:       "/backoffice/logs",

  // Pre-existing pages — no longer linked from the sidebar (superseded by the
  // Shadow/Controller/BackOffice reorganization) but left in place until
  // their replacements are built.
  DEPLOY:   "/deploy",
  DATABASE: "/database",
  SERVER:   "/server",
} as const;
