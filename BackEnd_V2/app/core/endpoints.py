class Endpoints:
    class AUTH:
        PREFIX = "/auth"
        LOGIN = "/login"
        REGISTER = "/register"
        USER_DATA = "/me"

    class ONBOARDING:
        PREFIX = "/onboarding"
        QUESTION = "/question"

ENDPOINTS = Endpoints()