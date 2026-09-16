from datetime import datetime

from sqlalchemy import ForeignKey, String, func
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
    last_seen_at: Mapped[datetime] = mapped_column(server_default=func.now())
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
