from datetime import datetime

from pydantic import BaseModel, Field


class SessionInfoResponse(BaseModel):
    id: int
    device_name: str
    custom_name: str | None = None
    browser: str
    os_name: str
    ip_address: str | None
    last_seen_at: datetime
    created_at: datetime
    is_current: bool = False


class SessionsListResponse(BaseModel):
    sessions: list[SessionInfoResponse]
    current_session_id: int | None
    max_concurrent_devices: int
    session_limit_exceeded: bool


class RenameSessionRequest(BaseModel):
    # None/empty clears the custom name — the UI then falls back to device_name.
    custom_name: str | None = Field(default=None, max_length=200)
