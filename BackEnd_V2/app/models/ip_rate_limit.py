from datetime import datetime

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class IpRateLimitDBM(Base):
    """Per-IP login and registration attempt counters, shared across all workers."""

    __tablename__ = "ip_rate_limits"

    ip: Mapped[str] = mapped_column(String(45), primary_key=True)
    kind: Mapped[str] = mapped_column(String(16), primary_key=True)  # "login" | "register"
    attempts: Mapped[int] = mapped_column(default=0, server_default="0")
    lockout_until: Mapped[datetime | None] = mapped_column(nullable=True, default=None)
    window_start: Mapped[datetime | None] = mapped_column(nullable=True, default=None)
