from pydantic import BaseModel, field_validator

from app.validators.email import validate_email_address
from app.validators.password import validate_password
from app.validators.name import validate_name

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    email: str
    password: str
    
    _validate_email = field_validator("email")(validate_email_address)
    _validate_password = field_validator("password")(validate_password)

class RegisterRequest(LoginRequest):
    name: str

    _validate_name = field_validator("name")(validate_name)