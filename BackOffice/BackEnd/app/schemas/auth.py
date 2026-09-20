from pydantic import BaseModel, ConfigDict, field_validator

from app.validators.email import validate_email_address


class LoginRequest(BaseModel):
    email: str
    password: str

    _validate_email = field_validator("email")(validate_email_address)


class AdminUserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    role: str = "Administrator"
