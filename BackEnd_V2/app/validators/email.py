from email_validator import EmailNotValidError, validate_email


def validate_email_address(value: str) -> str:
    value = value.strip()

    if not value:
        raise ValueError("Please enter your email.")

    try:
        validate_email(
            value,
            check_deliverability=False,
        )
    except EmailNotValidError:
        raise ValueError("Please enter a valid email address.")

    return value
