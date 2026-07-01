"""Application-level errors.

Services raise these framework-agnostic errors; a single handler in
``app/main.py`` maps them to HTTP responses. This keeps routers thin and
avoids coupling business logic to FastAPI.
"""

from __future__ import annotations


class AppError(Exception):
    """Base application error carrying an HTTP status and safe detail."""

    status_code: int = 400
    detail: str = "Bad request"

    def __init__(self, detail: str | None = None) -> None:
        if detail is not None:
            self.detail = detail
        super().__init__(self.detail)


class NotFoundError(AppError):
    status_code = 404
    detail = "Resource not found"


class ConflictError(AppError):
    status_code = 409
    detail = "Conflict"


class AuthError(AppError):
    status_code = 401
    detail = "Could not validate credentials"


class PermissionError_(AppError):
    status_code = 403
    detail = "Not permitted"
