from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ActiveSessionDBM(Base):
    __tablename__ = "active_sessions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    device_name: Mapped[str] = mapped_column(String(200), default="Unknown Device")
    custom_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    browser: Mapped[str] = mapped_column(String(100), default="Unknown")
    os_name: Mapped[str] = mapped_column(String(100), default="Unknown")
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    refresh_token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Set True the first time this session is actually used to authenticate a
    # request (see get_current_user). A row that never gets confirmed means the
    # login's cookies never made it back to the server on any later request —
    # e.g. blocked by SameSite, or the browser/tab was closed immediately after
    # login — so it's excluded from the Active Sessions list (see get_sessions)
    # rather than lingering forever with no way to identify and revoke it.
    confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("true"))
    last_seen_at: Mapped[datetime] = mapped_column(server_default=func.now())
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
