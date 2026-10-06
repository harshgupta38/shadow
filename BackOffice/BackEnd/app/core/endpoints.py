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
        # {app} is "shadow" or "backoffice" — same reasoning as DATABASE.PREFIX above.
        PREFIX = "/deploy/{app}"
        HISTORY = ""
        NEW = "/new"
        ROLLBACK = "/rollback"
        COMMITS = "/commits"
        BRANCHES = "/branches"
        DETAIL = "/{deployment_id}"

    class DATABASE:
        # {app} is "shadow" or "backoffice" — which app's database this
        # request targets. Every sub-path below is unchanged either way;
        # only the prefix segment picks the target (see app/api/database.py).
        PREFIX = "/database/{app}"
        TABLES = "/tables"
        ROWS = "/tables/{table_name}/rows"
        ROW = "/tables/{table_name}/row"
        BLOB = "/tables/{table_name}/blob"
        QUERY = "/query"
        SQL_HISTORY = "/sql-history"
        SPLIT_SQL = "/split-sql"
        BACKUPS = "/backups"
        BACKUP_FILE = "/backups/{filename}"
        BACKUP_RESTORE = "/backups/{filename}/restore"
        BACKUP_TABLES = "/backups/{filename}/tables"
        BACKUP_ROWS = "/backups/{filename}/tables/{table_name}/rows"
        BACKUP_ROW = "/backups/{filename}/tables/{table_name}/row"

    class SERVER:
        # {app} is "shadow" or "backoffice" — same reasoning as DATABASE.PREFIX above.
        PREFIX = "/server/{app}"
        HEALTH = "/health"
        HEALTH_WS = "/health/ws"
        WORKERS = "/workers"
        LOG_WS = "/log/ws"
        RESTART = "/restart"
        RESTART_DETAIL = "/restart/{restart_id}"
        RESTART_HISTORY = "/restart-history"

    class USERS:
        PREFIX = "/users"
        SHADOW = "/shadow"
        BACKOFFICE = "/backoffice"
        SHADOW_DELETE = "/shadow/{user_id}"

    class DELETED_DATA:
        # Read-only browsing of deleted_data.db — the "Deleted Data" tab on
        # the Database page. Not app-parameterized like DATABASE above: it's
        # a single BackOffice-owned archive, not per-target.
        PREFIX = "/deleted-data"
        TABLES = "/tables"
        ROWS = "/tables/{table_name}/rows"
        ROW = "/tables/{table_name}/row"


ENDPOINTS = Endpoints()
