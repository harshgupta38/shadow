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


def settle_row(db: Session, model, row_id: int, from_statuses: tuple[str, ...], **values) -> bool:
    """Compare-and-set for a job's outcome: writes `values` only while the row still has one of `from_statuses`. Two
    readers or two startups can reach the same unsettled row together. The write that lands first is the outcome; the
    other matches no row and changes nothing. Returns whether this write landed."""
    landed = (
        db.query(model)
        .filter(model.id == row_id, model.status.in_(from_statuses))
        .update(values, synchronize_session=False)
    )
    db.commit()
    return landed == 1
