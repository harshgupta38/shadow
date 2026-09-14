from pydantic import BaseModel, field_validator

from app.validators.email import validate_email_address
from app.validators.password import validate_password
from app.validators.name import validate_name
from app.schemas.session import SessionInfoResponse


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    # Session / device-limit fields — populated on login/register, empty on refresh
    session_limit_exceeded: bool = False
    sessions: list[SessionInfoResponse] = []
    current_session_id: int | None = None
    max_concurrent_devices: int = 2


class RefreshRequest(BaseModel):
    refresh_token: str


class LoginRequest(BaseModel):
    email: str
    password: str
    
    _validate_email = field_validator("email")(validate_email_address)
    _validate_password = field_validator("password")(validate_password)

class RegisterRequest(LoginRequest):
    name: str

    _validate_name = field_validator("name")(validate_name)