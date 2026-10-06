from sqlalchemy import BigInteger  # pyright: ignore[reportMissingImports]
from sqlalchemy.orm import Mapped, mapped_column  # pyright: ignore[reportMissingImports]

from app.models.base import Base

DATA_VERSION_ROW_ID = 1


class DataVersionDBM(Base):
    """Single-row counter that changes whenever user data is written.

    Bumped inside the same transaction as the write (see app/db/change_tracking.py), so it is
    shared by every uvicorn worker through the database. Response caches compare against it to
    learn that something changed, wherever in the cluster the write happened.
    """

    __tablename__ = "data_versions"

    id: Mapped[int] = mapped_column(primary_key=True)
    version: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
