from typing import Literal

from pydantic import BaseModel, field_validator

from app.core.timezone import UtcDateTime

from app.validators.email import validate_email_address
from app.validators.name import validate_name
from app.validators.password import validate_password_strong

UserStatus = Literal["active", "away", "inactive"]


class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    status: UserStatus
    # Shadow V2's users have this; BackOffice's admins don't track it, so it's
    # left null there rather than faked — the frontend hides the pill when null.
    email_verified: bool | None = None
    created_at: UtcDateTime


class CreateAdminRequest(BaseModel):
    # The CALLER's own password — re-confirmed here as a step-up check before
    # minting a new admin, independent of their already-authenticated cookie.
    current_password: str
    name: str
    email: str
    password: str
    # Must match settings.new_admin_secret — see that field's docstring.
    secret_key: str

    _validate_name = field_validator("name")(validate_name)
    _validate_email = field_validator("email")(validate_email_address)
    _validate_password = field_validator("password")(validate_password_strong)


class DeleteUserRequest(BaseModel):
    # Must match the target user's actual email, checked server-side in
    # deleted_data_service — never trusted just because the UI's own
    # confirmation input matched client-side.
    confirm_email: str


class DeleteUserResponse(BaseModel):
    user_id: int
    email: str
    name: str
    # table name -> number of rows archived and removed from shadow.db.
    archived_rows: dict[str, int]
    # The permanent "deleted-user-" safety backup taken just before —
    # visible/restorable from the Backups tab.
    backup_filename: str
