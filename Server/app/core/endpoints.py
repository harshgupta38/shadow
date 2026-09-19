class Endpoints:
    class SYSTEM:
        ROOT = "/"
        HEALTH = "/health"
        HEALTH_MAIN = "/health/main"
        HEALTH_BACKOFFICE = "/health/backoffice"
        HEALTH_ALL = "/health/all"

    class CONTROL:
        PREFIX = "/control"
        MAIN_RESTART = "/main/restart"
        MAIN_DEPLOY = "/main/deploy"
        MAIN_ROLLBACK = "/main/rollback"
        BACKOFFICE_RESTART = "/backoffice/restart"
        BACKOFFICE_DEPLOY = "/backoffice/deploy"

    class LOGS:
        PREFIX = "/logs"
        MAIN = "/main"
        MAIN_DOWNLOAD = "/main/download"
        BACKOFFICE = "/backoffice"
        BACKOFFICE_DOWNLOAD = "/backoffice/download"
        CONTROL = "/control"

    class DATABASE:
        PREFIX = "/db"
        MAIN_DOWNLOAD = "/main/download"
        MAIN_QUERY = "/main/query"
        BACKOFFICE_DOWNLOAD = "/backoffice/download"
        BACKOFFICE_QUERY = "/backoffice/query"

    class GIT:
        PREFIX = "/git"
        MAIN = "/main"
        BACKOFFICE = "/backoffice"


ENDPOINTS = Endpoints()
