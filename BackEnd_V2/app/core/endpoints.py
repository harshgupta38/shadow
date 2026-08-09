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

ENDPOINTS = Endpoints()