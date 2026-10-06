import re

_UPPER   = re.compile(r"[A-Z]")
_LOWER   = re.compile(r"[a-z]")
_DIGIT   = re.compile(r"[0-9]")
_SPECIAL = re.compile(r"[^A-Za-z0-9]")


def validate_password(value: str) -> str:
    """Basic length checks — used for login (never enforces complexity)."""
    if not value:
        raise ValueError("Please enter your password.")
    if len(value) < 8:
        raise ValueError("Password must be at least 8 characters long.")
    if len(value) > 128:
        raise ValueError("Password cannot exceed 128 characters.")
    return value


def validate_password_strong(value: str) -> str:
    """Full complexity checks — used for registration and password changes."""
    value = validate_password(value)

    missing: list[str] = []
    if not _UPPER.search(value):
        missing.append("one uppercase letter")
    if not _LOWER.search(value):
        missing.append("one lowercase letter")
    if not _DIGIT.search(value):
        missing.append("one number")
    if not _SPECIAL.search(value):
        missing.append("one special character")

    if missing:
        raise ValueError(f"Password must contain at least {', '.join(missing)}.")

    return value