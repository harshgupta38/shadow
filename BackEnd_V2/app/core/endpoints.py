class Endpoints:
    class APPEARANCE:
        PREFIX = "/settings/appearance"
        DYNAMIC_RESOLVE = "/dynamic-resolve"

    class SYSTEM:
        ROOT = "/"
        HEALTH = "/health"
        SERVER_LOG = "/server/log"
        ADMIN_SQL = "/admin/sql"
        ADMIN_DATABASE = "/admin/database" # extra
        ADMIN_BACKUPS = "/admin/backups"
        ADMIN_BACKUP_FILE = "/admin/backups/{filename}"
        ADMIN_BACKUP_RESTORE = "/admin/backups/{filename}/restore"
        ADMIN_BACKUP_QUERY = "/admin/backups/{filename}/query"

    class SHORTCUTS:
        PREFIX = "/shortcuts"
        UPDATE = "/update"

    class AUTH:
        PREFIX = "/auth"
        LOGIN = "/login"
        REGISTER = "/register"
        REFRESH = "/refresh"
        LOGOUT = "/logout"
        USER_DATA = "/my-data"
        SESSIONS = "/sessions"
        SESSION_DETAIL = "/sessions/{session_id}"
        SESSION_EVENTS = "/sessions/events"
        NAME = "/name"
        CHANGE_PASSWORD = "/change-password"
        RESEND_VERIFICATION = "/resend-verification"
        VERIFY_EMAIL = "/verify-email"
        FORGOT_PASSWORD = "/forgot-password"
        RESET_PASSWORD = "/reset-password"
        DEACTIVATE = "/deactivate"
        ACCOUNT = "/account"

    class PROFILE:
        PREFIX = "/profile"
        ROOT = ""
        BIO = "/bio"

    class DASHBOARD:
        PREFIX = "/dashboard"
        ROOT = ""

    class GOALS:
        PREFIX = "/goal"
        REFINE = "/refine"
        SAVE = "/save-goal"
        FROM_PROPOSAL = "/save-goal-from-proposal"
        GET_LIST = "/get-goal-list"
        DETAIL = "/{goal_id}"
        REORDER = "/reorder"

    class MILESTONES:
        PREFIX = "/milestone"
        SAVE = "/save-milestone"
        FROM_PROPOSAL = "/save-milestone-from-proposal"
        GET_LIST = "/get-milestone-list"
        DETAIL = "/{milestone_id}"

    class TASKS:
        PREFIX = "/task"
        SAVE = "/save-task"
        FROM_PROPOSAL = "/save-task-from-proposal"
        GET_LIST = "/get-task-list"
        DETAIL = "/{task_id}"
        ACTIVITY = "/{task_id}/activity"

    class HABITS:
        PREFIX = "/habit"
        SAVE = "/save-habit"
        GET_LIST = "/get-habit-list"
        DETAIL = "/{habit_id}"
        ACTIVITY = "/{habit_id}/activity"

    class SCHEDULE:
        PREFIX = "/schedule"
        SAVE = "/save-schedule-task"
        FROM_PROPOSAL = "/save-schedule-task-from-proposal"
        GET_LIST = "/get-schedule-task-list"
        DETAIL = "/{schedule_task_id}"

    class TRACK_PROGRESS:
        PREFIX = "/track"
        HABITS = "/habit-record"
        SET_TRACKING = "/set-habit-tracking"
        ELIGIBLE_HABITS = "/eligible-habits"
        TASKS = "/task-record"
        SET_TASK_TRACKING = "/set-task-tracking"
        ELIGIBLE_TASKS = "/eligible-tasks"

    class PLANNER:
        PREFIX = "/planner"
        FOR_DATE = "/for-date"
        RECORDS = "/records"
        RECORD = "/records/{record_id}"

    class REPORTS:
        PREFIX = "/reports"
        MONTHLY = "/monthly"
        REPORT_DETAIL = "/{report_date}"
        GENERATE_REPORT_REQUEST = "/{report_date}/request"
        EMAIL_REPORT_REQUEST = "/{report_date}/email"

    class NOTIFICATIONS:
        PREFIX = "/notifications"
        DETAIL = "/{notification_id}"
        MARK_READ = "/{notification_id}/read"
        MARK_READ_BATCH = "/mark-read-batch"
        MARK_ALL_READ = "/read-all"
        STREAM = "/stream"
        PUSH_PUBLIC_KEY = "/push/public-key"
        PUSH_SUBSCRIBE = "/push/subscriptions"
        PUSH_UNSUBSCRIBE = "/push/subscriptions"
        PUSH_DEVICE_CONNECTED_ALERT = "/push/device-connected-alert"
        EMAIL_UNSUBSCRIBE = "/email/unsubscribe"
        DAILY_BRIEF = "/daily-brief"
        DAILY_BRIEF_GENERATE = "/daily-brief/generate"

    class CHAT:
        PREFIX = "/chat"
        CONVERSATIONS = "/conversations" # to get list of sessions
        CONVERSATION_DETAIL = "/conversations/{conversation_id}" # to get/delete session
        MESSAGES = "/conversations/{conversation_id}/messages" # to talk to the assistant in a session
        NEW_MESSAGE = "/conversations/messages" # to create a new session and talk to the assistant
        REGENERATE_RESPONSE = "/conversations/{conversation_id}/regenerate_response/{message_id}"
        RETRY_FAILED_MESSAGE = "/conversations/{conversation_id}/retry_message/{message_id}"

    class SETTINGS:
        PREFIX = "/settings"
        AI_PROVIDERS = "/ai-providers"
        PROVIDER_HEALTH_CHECK = "/ai-providers/health-check"
        EXPORT = "/export"
        CHAT_HISTORY = "/chat-history"
        MEMORIES_COUNT = "/memories/count"
        CUSTOM_KEY_TEST = "/custom-api-key/test"

ENDPOINTS = Endpoints()