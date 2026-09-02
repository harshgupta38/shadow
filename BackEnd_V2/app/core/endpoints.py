class Endpoints:
    class AUTH:
        PREFIX = "/auth"
        LOGIN = "/login"
        REGISTER = "/register"
        REFRESH = "/refresh"
        USER_DATA = "/my-data"

    class GOALS:
        PREFIX = "/goal"
        REFINE = "/refine"
        SAVE = "/save-goal"
        FROM_PROPOSAL = "/save-goal-from-proposal"
        GET_LIST = "/get-goal-list"
        DETAIL = "/{goal_id}"

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

    class HABITS:
        PREFIX = "/habit"
        SAVE = "/save-habit"
        GET_LIST = "/get-habit-list"
        DETAIL = "/{habit_id}"

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

    class PLANNER:
        PREFIX = "/planner"
        FOR_DATE = "/for-date"
        RECORD = "/records/{record_id}"

    class CHAT:
        PREFIX = "/chat"
        CONVERSATIONS = "/conversations" # to get list of sessions
        CONVERSATION_DETAIL = "/conversations/{conversation_id}" # to get/delete session
        MESSAGES = "/conversations/{conversation_id}/messages" # to talk to the assistant in a session
        NEW_MESSAGE = "/conversations/messages" # to create a new session and talk to the assistant
        REGENERATE_RESPONSE = "/conversations/{conversation_id}/regenerate_response/{message_id}"
        RETRY_FAILED_MESSAGE = "/conversations/{conversation_id}/retry_message/{message_id}"

ENDPOINTS = Endpoints()