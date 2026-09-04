from datetime import date

MIN_YEAR = 1900


def _to_int_or_zero(value: str) -> int:
    try:
        return int(value.strip())
    except (ValueError, TypeError, AttributeError):
        return 0


def validate_day(value: str) -> str:
    day_int = _to_int_or_zero(value)

    if day_int == 0:
        raise ValueError("Please select day.")

    if day_int < 1 or day_int > 31:
        raise ValueError("Please select a valid day.")

    return value


def validate_month(value: str) -> str:
    month_int = _to_int_or_zero(value)

    if month_int == 0:
        raise ValueError("Please select month.")

    if month_int < 1 or month_int > 12:
        raise ValueError("Please select a valid month.")

    return value


def validate_year(value: str) -> str:
    year_int = _to_int_or_zero(value)

    if year_int == 0:
        raise ValueError("Please select year.")

    current_year = date.today().year
    if year_int < MIN_YEAR or year_int > current_year:
        raise ValueError(f"Year must be between {MIN_YEAR} and {current_year}.")

    return value


def validate_date(day: str, month: str, year: str) -> None:
    day_int = _to_int_or_zero(day)
    month_int = _to_int_or_zero(month)
    year_int = _to_int_or_zero(year)

    try:
        parsed_date = date(year_int, month_int, day_int)
    except ValueError:
        raise ValueError("Please enter a valid date.")

    if parsed_date > date.today():
        raise ValueError("Date cannot be in the future.")
