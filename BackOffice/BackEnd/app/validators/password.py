def validate_password(value: str) -> str:
    """Basic length check — mirrors create_admin.py's own CLI rule."""
    if not value:
        raise ValueError("Please enter a password.")
    if len(value) < 8:
        raise ValueError("Password must be at least 8 characters long.")
    if len(value) > 128:
        raise ValueError("Password cannot exceed 128 characters.")
    return value
