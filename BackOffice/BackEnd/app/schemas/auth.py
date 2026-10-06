from pydantic import BaseModel, ConfigDict, field_validator

from app.validators.email import validate_email_address
from app.validators.password import validate_password


class LoginRequest(BaseModel):
    email: str
    password: str

    _validate_email = field_validator("email")(validate_email_address)
    _validate_password = field_validator("password")(validate_password)


class AdminUserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    role: str = "Administrator"


class LoginResponse(BaseModel):
    admin: AdminUserResponse
    access_token: str
