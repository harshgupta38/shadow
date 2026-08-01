from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)

    name: Mapped[str] = mapped_column(
        String(120),
        nullable=False,
    )

    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        index=True,
        nullable=False,
    )

    hashed_password: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    birth_day: Mapped[str | None] = mapped_column(
        String(2),
        nullable=True,
    )

    birth_month: Mapped[str | None] = mapped_column(
        String(2),
        nullable=True,
    )

    birth_year: Mapped[str | None] = mapped_column(
        String(4),
        nullable=True,
    )

    gender: Mapped[str | None] = mapped_column(
        String(16),
        nullable=True,
    )

    onboarding_completed: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
