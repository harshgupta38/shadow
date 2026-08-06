class AppError(Exception):
    status_code = 400
    detail = "Bad request"

    def __init__(self, detail: str | None = None):
        if detail is not None:
            self.detail = detail

        super().__init__(self.detail)


class AuthError(AppError):
    status_code = 401
    detail = "Invalid email or password."


class ConflictError(AppError):
    status_code = 409
    detail = "Conflict."


class ValidationError(AppError):
    status_code = 400
    detail = "Please correct the highlighted fields."

    def __init__(self, detail: str | None = None, errors: dict[str, str] | None = None):
        super().__init__(detail)
        self.errors = errors or {}
