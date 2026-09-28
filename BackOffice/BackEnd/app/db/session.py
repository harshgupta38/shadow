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


def ensure_columns(table: str, columns: dict[str, str]) -> None:
    """Adds any of `columns` (name -> SQL type/constraint clause, e.g.
    "VARCHAR(16) DEFAULT 'shadow'") that don't already exist on `table` via
    ALTER TABLE ADD COLUMN — a no-op for whichever already do. Lets a new
    model column show up on an EXISTING backoffice.db without a full
    migration tool, called once at startup right after
    Base.metadata.create_all() (which only ever creates brand-new tables,
    never alters existing ones).
    """
    with engine.connect() as conn:
        existing = {row[1] for row in conn.exec_driver_sql(f'PRAGMA table_info("{table}")')}
        for name, clause in columns.items():
            if name in existing:
                continue
            conn.exec_driver_sql(f'ALTER TABLE "{table}" ADD COLUMN "{name}" {clause}')
        conn.commit()

