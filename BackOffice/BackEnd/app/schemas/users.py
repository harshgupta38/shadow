from datetime import datetime
from typing import Literal

from pydantic import BaseModel

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
