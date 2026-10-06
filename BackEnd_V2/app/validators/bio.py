def validate_bio(value: str) -> str:
    value = value.strip()

    if len(value) > 140:
        raise ValueError("Bio cannot exceed 140 characters.")

    return value
