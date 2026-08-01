def validate_gender(value: str) -> str:
    normalized = value.strip().lower()
    if normalized not in {"male", "female"}:
        raise ValueError("Gender must be either Male or Female.")
    return normalized
