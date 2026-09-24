import re

from collections.abc import Generator

from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings


engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},
)


def ensure_sqlite_habits_autoincrement(db_engine: Engine) -> None:
    if db_engine.dialect.name != "sqlite":
        return

    with db_engine.begin() as conn:
        table_sql = conn.execute(
            text("SELECT sql FROM sqlite_master WHERE type='table' AND name='habits'")
        ).scalar_one_or_none()
        if table_sql is None or "AUTOINCREMENT" in table_sql.upper():
            return

        index_sql = conn.execute(
            text(
                "SELECT sql FROM sqlite_master "
                "WHERE type='index' AND tbl_name='habits' AND sql IS NOT NULL"
            )
        ).scalars().all()

        new_table_sql, renamed = re.subn(
            r'CREATE TABLE\s+"?habits"?',
            "CREATE TABLE habits__autoinc",
            table_sql,
            count=1,
            flags=re.IGNORECASE,
        )
        if renamed == 0:
            raise RuntimeError("Could not rewrite habits table name for AUTOINCREMENT upgrade.")

        new_table_sql, id_replaced = re.subn(
            r"\bid\b\s+INTEGER\s+NOT\s+NULL",
            "id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT",
            new_table_sql,
            count=1,
            flags=re.IGNORECASE,
        )
        if id_replaced == 0:
            new_table_sql, id_replaced = re.subn(
                r"\bid\b\s+INTEGER\s+PRIMARY\s+KEY",
                "id INTEGER PRIMARY KEY AUTOINCREMENT",
                new_table_sql,
                count=1,
                flags=re.IGNORECASE,
            )

        new_table_sql = re.sub(
            r",\s*PRIMARY KEY\s*\(\s*id\s*\)\s*,",
            ",",
            new_table_sql,
            count=1,
            flags=re.IGNORECASE,
        )

        if id_replaced == 0 or "AUTOINCREMENT" not in new_table_sql.upper():
            raise RuntimeError("Could not add AUTOINCREMENT to habits id definition.")

        conn.execute(text(new_table_sql))

        column_names = [
            row[1] for row in conn.execute(text("PRAGMA table_info(habits)")).all()
        ]
        quoted_columns = ", ".join(f'"{name}"' for name in column_names)

        conn.execute(
            text(
                f"INSERT INTO habits__autoinc ({quoted_columns}) "
                f"SELECT {quoted_columns} FROM habits"
            )
        )
        conn.execute(text("DROP TABLE habits"))
        conn.execute(text("ALTER TABLE habits__autoinc RENAME TO habits"))

        max_id = conn.execute(text("SELECT COALESCE(MAX(id), 0) FROM habits")).scalar_one()
        conn.execute(text("DELETE FROM sqlite_sequence WHERE name='habits'"))
        conn.execute(
            text("INSERT INTO sqlite_sequence(name, seq) VALUES ('habits', :seq)"),
            {"seq": max_id},
        )

        for sql in index_sql:
            conn.execute(text(sql))


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

'''
SELECT sqlite_version();

SELECT sql
FROM sqlite_master
WHERE type = 'table' AND name = 'habits';

SELECT name, sql
FROM sqlite_master
WHERE type = 'index' AND tbl_name = 'habits';

SELECT COUNT(*) AS total_habits, COALESCE(MAX(id), 0) AS max_habit_id
FROM habits;

---------------------------------------------------------------------
PRAGMA foreign_keys = OFF;
BEGIN IMMEDIATE;

CREATE TABLE habits__autoinc (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    goal_id INTEGER,
    title VARCHAR(255) NOT NULL,
    note VARCHAR(2000),
    frequencies JSON NOT NULL,
    preferred_time VARCHAR(16) DEFAULT 'flexible' NOT NULL,
    specific_time VARCHAR(10),
    duration_minutes INTEGER,
    start_date DATE,
    end_date DATE,
    weekly_count INTEGER,
    monthly_count INTEGER,
    specific_days JSON,
    day_fallback BOOLEAN DEFAULT false NOT NULL,
    priority VARCHAR(16) DEFAULT 'medium' NOT NULL,
    status VARCHAR(16) DEFAULT 'active' NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    planner_type VARCHAR(8) DEFAULT 'simple' NOT NULL,
    planner_target INTEGER,
    value_unit VARCHAR(64),
    category TEXT,
    tracking_enabled BOOLEAN NOT NULL DEFAULT 0,
    include_in_report BOOLEAN NOT NULL DEFAULT 1,
    can_skip BOOLEAN NOT NULL DEFAULT 0,
    CONSTRAINT ck_habits_preferred_time CHECK (preferred_time IN ('flexible', 'morning', 'afternoon', 'evening', 'night', 'custom')),
    CONSTRAINT ck_habits_priority CHECK (priority IN ('highest', 'high', 'medium', 'low', 'lowest')),
    CONSTRAINT ck_habits_status CHECK (status IN ('active', 'paused', 'archived')),
    CONSTRAINT ck_habits_duration_minutes CHECK (duration_minutes IS NULL OR duration_minutes > 0),
    CONSTRAINT ck_habits_weekly_count CHECK (weekly_count IS NULL OR (weekly_count >= 1 AND weekly_count <= 6)),
    CONSTRAINT ck_habits_monthly_count CHECK (monthly_count IS NULL OR (monthly_count >= 1 AND monthly_count <= 27)),
    CONSTRAINT ck_habits_date_range CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
    CONSTRAINT ck_habits_planner_type CHECK (planner_type IN ('simple', 'metric')),
    CONSTRAINT ck_habits_planner_target CHECK (planner_target IS NULL OR planner_target > 0),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(goal_id) REFERENCES goals(id) ON DELETE SET NULL
);

INSERT INTO habits__autoinc (
    id, user_id, goal_id, title, note, frequencies, preferred_time, specific_time,
    duration_minutes, start_date, end_date, weekly_count, monthly_count, specific_days,
    day_fallback, priority, status, created_at, updated_at, planner_type, planner_target,
    value_unit, category, tracking_enabled, include_in_report, can_skip
)
SELECT
    id, user_id, goal_id, title, note, frequencies, preferred_time, specific_time,
    duration_minutes, start_date, end_date, weekly_count, monthly_count, specific_days,
    day_fallback, priority, status, created_at, updated_at, planner_type, planner_target,
    value_unit, category, tracking_enabled, include_in_report, can_skip
FROM habits;

DROP TABLE habits;
ALTER TABLE habits__autoinc RENAME TO habits;

CREATE INDEX ix_habits_user_id ON habits(user_id);
CREATE INDEX ix_habits_goal_id ON habits(goal_id);

DELETE FROM sqlite_sequence WHERE name = 'habits';
INSERT INTO sqlite_sequence(name, seq)
SELECT 'habits', COALESCE(MAX(id), 0) FROM habits;

COMMIT;
PRAGMA foreign_keys = ON;

---------------------------------------------------------------------
SELECT sql
FROM sqlite_master
WHERE type = 'table' AND name = 'habits';

SELECT name, sql
FROM sqlite_master
WHERE type = 'index' AND tbl_name = 'habits';

SELECT seq
FROM sqlite_sequence
WHERE name = 'habits';

'''