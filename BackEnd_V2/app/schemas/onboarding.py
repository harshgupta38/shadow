from pydantic import BaseModel, ValidationInfo, field_validator

from app.validators.date import (
    validate_day,
    validate_month,
    validate_year,
    validate_date,
)
from app.validators.gender import validate_gender
from app.validators.name import validate_name


class FoundationSaveRequest(BaseModel):
    name: str
    birthDay: str
    birthMonth: str
    birthYear: str
    gender: str

    _validate_name = field_validator("name")(validate_name)
    _validate_gender = field_validator("gender")(validate_gender)
    
    _validate_birth_day = field_validator("birthDay")(validate_day)
    _validate_birth_month = field_validator("birthMonth")(validate_month)
    _validate_birth_year = field_validator("birthYear")(validate_year)

    @field_validator("birthYear", mode="after")
    @classmethod
    def validate_full_birth_date(cls, value: str, info: ValidationInfo) -> str:
        birth_day = info.data.get("birthDay")
        birth_month = info.data.get("birthMonth")

        if birth_day is None or birth_month is None:
            return value

        validate_date(day=birth_day, month=birth_month, year=value)
        return value


class FoundationSaveResponse(BaseModel):
    success: bool = True
    message: str = "Foundation details saved successfully."
