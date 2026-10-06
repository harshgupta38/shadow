from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class SqlHistoryDBM(Base):
    """The last few queries an admin ran in the SQL Console, with what they returned, so the console
    can recall them (and their output) after a reload or on another device.

    Separate from SqlAuditLogDBM on purpose: the audit log is a permanent accountability record of
    every statement, while this is a small per-admin convenience that is trimmed on every write and
    that the admin can clear. Keeping the two apart means trimming history never touches the audit
    trail.
    """

    __tablename__ = "sql_console_history"
    __table_args__ = (Index("ix_sql_console_history_admin_app", "admin_email", "app", "id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    admin_email: Mapped[str] = mapped_column(String(255), nullable=False)
    app: Mapped[str] = mapped_column(String(16), nullable=False)  # "shadow" | "backoffice"
    query: Mapped[str] = mapped_column(Text, nullable=False)
    success: Mapped[bool] = mapped_column(Boolean, nullable=False)
    # First page of a successful result as JSON (columns, rows, rowcount, total, page, page_size).
    result_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    # True when result_json had rows dropped to stay under the size cap.
    truncated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    executed_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )
