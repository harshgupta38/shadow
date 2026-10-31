from datetime import datetime

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ReportEmailSendDBM(Base):
    """When each user last sent a manual "Email report" copy. The row is the cooldown that all workers share."""

    __tablename__ = "report_email_sends"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    last_sent_at: Mapped[datetime] = mapped_column(nullable=False)  # naive UTC, like the other timestamps here
