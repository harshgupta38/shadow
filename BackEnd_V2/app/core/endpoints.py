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
        FROM_PROPOSAL = "/from-proposal"
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
        CONVERSATIONS = "/conversations" # to get list of sessions
        CONVERSATION_DETAIL = "/conversations/{conversation_id}" # to get/delete session
        MESSAGES = "/conversations/{conversation_id}/messages" # to talk to the assistant in a session
        NEW_MESSAGE = "/conversations/messages" # to create a new session and talk to the assistant
        REGENERATE_RESPONSE = "/conversations/{conversation_id}/regenerate_response/{message_id}"

ENDPOINTS = Endpoints()