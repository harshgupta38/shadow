from datetime import datetime
from typing import Literal

from pydantic import BaseModel, field_validator

from app.validators.email import validate_email_address
from app.validators.password import validate_password

UserStatus = Literal["active", "away", "inactive"]


class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    status: UserStatus
    # Shadow V2's users have this; BackOffice's admins don't track it, so it's
    # left null there rather than faked — the frontend hides the pill when null.
    email_verified: bool | None = None
    created_at: datetime


class CreateAdminRequest(BaseModel):
    # The CALLER's own password — re-confirmed here as a step-up check before
    # minting a new admin, independent of their already-authenticated cookie.
    current_password: str
    name: str
    email: str
    password: str
    # Must match settings.new_admin_secret — see that field's docstring.
    secret_key: str

    _validate_email = field_validator("email")(validate_email_address)
    _validate_password = field_validator("password")(validate_password)
