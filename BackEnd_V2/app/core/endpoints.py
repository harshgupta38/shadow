class Endpoints:
    class AUTH:
        PREFIX = "/auth"
        LOGIN = "/login"
        REGISTER = "/register"
        USER_DATA = "/me"

    class GOALS:
        PREFIX = "/goal"
        REFINE = "/refine"
        SAVE = "/save"
        GET_LIST = "/get-list"
        DETAIL = "/{goal_id}"

    class MILESTONES:
        PREFIX = "/milestone"
        SAVE = "/save"
        GET_LIST = "/get-list"
        DETAIL = "/{milestone_id}"

    class TASKS:
        PREFIX = "/task"
        SAVE = "/save"
        GET_LIST = "/get-list"
        DETAIL = "/{task_id}"

    class CHAT:
        PREFIX = "/chat"
        CONVERSATIONS = "/conversations"
        CONVERSATION_DETAIL = "/conversations/{conversation_id}"
        MESSAGES = "/conversations/{conversation_id}/messages"


ENDPOINTS = Endpoints()
