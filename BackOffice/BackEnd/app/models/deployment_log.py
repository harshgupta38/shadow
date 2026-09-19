from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class DeploymentLogDBM(Base):
    """A record of a deploy/rollback action triggered from BackOffice.

    This is genuinely new — BackEnd_V2 has no deploy/restart history of its
    own (the control server + restart_server.sh only ever leave behind
    server.log, which is overwritten on every restart).
    """

    __tablename__ = "deployment_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # User-facing label/description — informational, does not affect what's
    # actually deployed (there are no git tags in this repo; every deploy is
    # "pull latest on the tracked branch").
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    target: Mapped[str] = mapped_column(String(16), default="Backend", nullable=False)

    kind: Mapped[str] = mapped_column(String(16), nullable=False)  # "deploy" | "rollback"
    git_ref: Mapped[str] = mapped_column(String(255), nullable=False)  # branch ref or commit sha requested
    commit_sha: Mapped[str | None] = mapped_column(String(64), nullable=True)  # resolved HEAD once known

    status: Mapped[str] = mapped_column(String(16), default="running", nullable=False)
    # running | success | failed | unknown
    log_output: Mapped[str] = mapped_column(Text, default="", nullable=False)

    triggered_by: Mapped[str] = mapped_column(String(80), nullable=False)
    started_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
