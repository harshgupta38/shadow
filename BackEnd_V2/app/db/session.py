from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings


engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},
)


@event.listens_for(engine, "connect")
def _enable_sqlite_foreign_keys(dbapi_connection, connection_record):
    if engine.dialect.name != "sqlite":
        return
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
    class_=Session,
)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()

    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def ensure_habit_columns() -> None:
    """Additive columns added to `habits` after the table already existed in
    deployed/dev databases. This project has no migration framework (SQLite,
    single-developer scale) — Base.metadata.create_all() only creates missing
    TABLES, never adds columns to one that already exists. Guarded by
    PRAGMA table_info so re-running against an already-upgraded DB is a
    no-op. Call only after create_all() has run (so the table exists)."""
    if engine.dialect.name != "sqlite":
        return

    with engine.connect() as conn:
        existing = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(habits)").fetchall()}
        if "include_in_report" not in existing:
            conn.exec_driver_sql("ALTER TABLE habits ADD COLUMN include_in_report BOOLEAN NOT NULL DEFAULT 1")
        if "can_skip" not in existing:
            conn.exec_driver_sql("ALTER TABLE habits ADD COLUMN can_skip BOOLEAN NOT NULL DEFAULT 0")
        conn.commit()


def ensure_plan_record_columns() -> None:
    """Additive column added to `plan_records` after the table already existed.
    Same reasoning as ensure_habit_columns — see its docstring."""
    if engine.dialect.name != "sqlite":
        return

    with engine.connect() as conn:
        existing = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(plan_records)").fetchall()}
        if "skipped" not in existing:
            conn.exec_driver_sql("ALTER TABLE plan_records ADD COLUMN skipped BOOLEAN NOT NULL DEFAULT 0")
        conn.commit()
