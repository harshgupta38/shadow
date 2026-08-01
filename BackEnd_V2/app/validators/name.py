def validate_name(value: str) -> str:
    value = value.strip()

    if not value:
        raise ValueError("Please enter your name.")

    if len(value) < 2:
        raise ValueError("Name must be at least 2 characters long.")

    if len(value) > 120:
        raise ValueError("Name cannot exceed 120 characters.")

    return value
