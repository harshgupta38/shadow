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
        DETAIL = "/{deployment_id}"

    class DATABASE:
        PREFIX = "/database"
        TABLES = "/tables"
        ROWS = "/tables/{table_name}/rows"
        QUERY = "/query"

    class SERVER:
        PREFIX = "/server"
        HEALTH = "/health"
        WORKERS = "/workers"
        LOG = "/log"
        RESTART = "/restart"
        RESTART_DETAIL = "/restart/{restart_id}"
        RESTART_HISTORY = "/restart-history"


ENDPOINTS = Endpoints()
