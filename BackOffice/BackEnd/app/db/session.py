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


def drop_column_if_present(table: str, column: str) -> None:
    """Startup migration for a column the models no longer declare. SQLite drops it in place
    (3.35+); once the column is gone this does nothing, so it is safe to run on every start."""
    with engine.begin() as conn:
        present = [row[1] for row in conn.exec_driver_sql(f"PRAGMA table_info({table})")]
        if column in present:
            conn.exec_driver_sql(f"ALTER TABLE {table} DROP COLUMN {column}")

