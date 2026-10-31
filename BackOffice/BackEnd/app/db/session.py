import sqlite3
from collections.abc import Generator

from sqlalchemy import MetaData, create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.schema import CreateIndex, CreateTable

from app.core.config import settings
from app.models.deployment_log import DeploymentLogDBM


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


# SQLite added DROP COLUMN in 3.35.0. Older builds (some Termux packages) get a table rebuild instead.
_DROP_COLUMN_MIN_VERSION = (3, 35, 0)

# The only table this migration may rebuild, taken from its model so the rebuilt table always matches the code.
_REBUILDABLE = {DeploymentLogDBM.__table__.name: DeploymentLogDBM.__table__}


def _rebuild_table_from_model(cur, table: str) -> None:
    """Rebuilds `table` from its model metadata without the columns the model no longer declares: a new table
    under a temporary name, the rows copied across (only the columns both versions share), the old table dropped,
    the new one renamed, and the model's indexes recreated. Runs inside the caller's transaction."""
    model_table = _REBUILDABLE[table]
    temp = f"{table}__rebuild"
    old = {row[1]: row for row in cur.execute(f"PRAGMA table_info({table})").fetchall()}
    shared = [column for column in model_table.columns if column.name in old]

    selects = []
    for column in shared:
        expr = f'"{column.name}"'
        default = column.server_default.arg if column.server_default is not None else None
        # A legacy column that was nullable (added with ADD COLUMN ... DEFAULT) may hold NULL where the model requires a value.
        if not column.nullable and not old[column.name][3] and isinstance(default, str):
            expr = f"COALESCE({expr}, '{default}')"
        selects.append(expr)

    cur.execute(f"DROP TABLE IF EXISTS {temp}")
    cur.execute(str(CreateTable(model_table.to_metadata(MetaData(), name=temp)).compile(dialect=engine.dialect)))
    columns = ", ".join(f'"{column.name}"' for column in shared)
    cur.execute(f"INSERT INTO {temp} ({columns}) SELECT {', '.join(selects)} FROM {table}")

    copied = cur.execute(f"SELECT COUNT(*) FROM {temp}").fetchone()[0]
    original = cur.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    if copied != original:
        raise RuntimeError(f"rebuilding {table}: copied {copied} of {original} rows")

    cur.execute(f"DROP TABLE {table}")
    cur.execute(f"ALTER TABLE {temp} RENAME TO {table}")
    for index in model_table.indexes:
        cur.execute(str(CreateIndex(index).compile(dialect=engine.dialect)))
    if cur.execute(f"PRAGMA foreign_key_check({table})").fetchall():
        raise RuntimeError(f"rebuilding {table}: foreign key violations")


def _fill_legacy_nulls(cur, table: str) -> None:
    """Rows written before a column was NOT NULL can hold NULL there. The model's server default is what such a row
    means (for `app`, a Shadow deploy), so it gets that value. The rebuild applies the same rule while it copies."""
    model_table = _REBUILDABLE.get(table)
    if model_table is None:
        return
    for column in model_table.columns:
        default = column.server_default.arg if column.server_default is not None else None
        if not column.nullable and isinstance(default, str):
            cur.execute(f'UPDATE {table} SET "{column.name}" = ? WHERE "{column.name}" IS NULL', (default,))


def drop_column_if_present(
    table: str, column: str, sqlite_version: tuple[int, ...] = sqlite3.sqlite_version_info,
) -> None:
    """Startup migration for a column the models no longer declare. Once the column is gone this does nothing, so it
    is safe to run on every start. The check and the change share one transaction, so a failure or an interruption
    leaves the table as it was. `sqlite_version` is a parameter so the older-SQLite path can be exercised directly."""
    raw = engine.raw_connection()
    try:
        cur = raw.cursor()
        # The rebuild drops a table, so foreign key enforcement is off while it runs (the connect hook turns it back on).
        cur.execute("PRAGMA foreign_keys=OFF")
        try:
            cur.execute("BEGIN IMMEDIATE")
            present = [row[1] for row in cur.execute(f"PRAGMA table_info({table})").fetchall()]
            if column in present:
                if tuple(sqlite_version) >= _DROP_COLUMN_MIN_VERSION:
                    cur.execute(f"ALTER TABLE {table} DROP COLUMN {column}")
                    _fill_legacy_nulls(cur, table)
                else:
                    _rebuild_table_from_model(cur, table)
            cur.execute("COMMIT")
        except BaseException:
            if raw.dbapi_connection.in_transaction:
                cur.execute("ROLLBACK")
            raise
        finally:
            cur.execute("PRAGMA foreign_keys=ON")
            cur.close()
    finally:
        raw.close()


def ensure_model_columns(model_table) -> None:
    """Startup migration that adds the columns the model declares but the table lacks, so a database created before a
    column existed gains it. Idempotent: a column already present is left alone. SQLite adds a column in place only when
    it is nullable or has a default, so a NOT NULL column without a server default is refused instead of added as
    nullable. The check and the change share one transaction, as in drop_column_if_present."""
    raw = engine.raw_connection()
    try:
        cur = raw.cursor()
        cur.execute("BEGIN IMMEDIATE")
        try:
            present = {row[1] for row in cur.execute(f"PRAGMA table_info({model_table.name})").fetchall()}
            for column in model_table.columns:
                if column.name in present:
                    continue
                default = column.server_default.arg if column.server_default is not None else None
                if not column.nullable and default is None:
                    raise RuntimeError(
                        f"{model_table.name}.{column.name} is missing and NOT NULL without a default, so it cannot be added in place."
                    )
                clause = column.type.compile(dialect=engine.dialect)
                if default is not None:
                    clause += f" {'NOT NULL ' if not column.nullable else ''}DEFAULT '{default}'"
                cur.execute(f'ALTER TABLE {model_table.name} ADD COLUMN "{column.name}" {clause}')
            cur.execute("COMMIT")
        except BaseException:
            if raw.dbapi_connection.in_transaction:
                cur.execute("ROLLBACK")
            raise
        finally:
            cur.close()
    finally:
        raw.close()


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
