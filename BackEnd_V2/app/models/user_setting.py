from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, JSON, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class UserSettingDBM(Base):
    __tablename__ = "user_settings"

    id: Mapped[int] = mapped_column(primary_key=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        index=True,
        nullable=False,
    )

    appearance: Mapped[dict] = mapped_column(JSON, nullable=False)
    notifications: Mapped[dict] = mapped_column(JSON, nullable=False)
    ai_behavior: Mapped[dict] = mapped_column(JSON, nullable=False)
    planner: Mapped[dict] = mapped_column(JSON, nullable=False)
    privacy: Mapped[dict] = mapped_column(JSON, nullable=False)
    accessibility: Mapped[dict] = mapped_column(JSON, nullable=False)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
