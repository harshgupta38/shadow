from datetime import datetime

from pydantic import BaseModel


class SessionInfoResponse(BaseModel):
    id: int
    device_name: str
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
