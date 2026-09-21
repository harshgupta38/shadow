class Endpoints:
    class SYSTEM:
        ROOT = "/"
        HEALTH = "/health"
        SERVER_LOG = "/server/log"
        ADMIN_SQL = "/admin/sql"
        ADMIN_DATABASE = "/admin/database"

    class AUTH:
        PREFIX = "/auth"
        LOGIN = "/login"
        LOGOUT = "/logout"
        ME = "/me"

    class DEPLOY:
        PREFIX = "/deploy"
        HISTORY = ""
        NEW = "/new"
        ROLLBACK = "/rollback"
        COMMITS = "/commits"
        BRANCHES = "/branches"
        DETAIL = "/{deployment_id}"

    class DATABASE:
        PREFIX = "/database"
        TABLES = "/tables"
        ROWS = "/tables/{table_name}/rows"
        ROW = "/tables/{table_name}/row"
        QUERY = "/query"
        BACKUPS = "/backups"
        BACKUP_FILE = "/backups/{filename}"
        BACKUP_RESTORE = "/backups/{filename}/restore"
        BACKUP_TABLES = "/backups/{filename}/tables"
        BACKUP_ROWS = "/backups/{filename}/tables/{table_name}/rows"
        BACKUP_ROW = "/backups/{filename}/tables/{table_name}/row"

    class SERVER:
        PREFIX = "/server"
        HEALTH = "/health"
        HEALTH_WS = "/health/ws"
        WORKERS = "/workers"
        LOG_STREAM = "/log/stream"
        RESTART = "/restart"
        RESTART_DETAIL = "/restart/{restart_id}"
        RESTART_HISTORY = "/restart-history"

    class USERS:
        PREFIX = "/users"
        SHADOW = "/shadow"
        BACKOFFICE = "/backoffice"


ENDPOINTS = Endpoints()
