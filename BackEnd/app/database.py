"""SQLAlchemy engine & session management.

The engine is built from ``settings.database_url`` so swapping SQLite for
PostgreSQL later is a config change only (12-factor).
"""

from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.constant import settings

# Build engine kwargs per backend. SQLite needs ``check_same_thread=False``
# with FastAPI's threadpool; server databases (e.g. PostgreSQL) benefit from a
# connection pool that recycles long-idle connections on a 24/7 service.
_engine_kwargs: dict = {"pool_pre_ping": True, "future": True}

if settings.is_sqlite:
    _connect_args: dict = {"check_same_thread": False}
else:
    _connect_args = {}
    _engine_kwargs.update(pool_size=5, max_overflow=10, pool_recycle=1800)

engine = create_engine(
    settings.database_url,
    connect_args=_connect_args,
    **_engine_kwargs,
)

SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
    class_=Session,
)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a request-scoped DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
