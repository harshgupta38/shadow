import logging

from sqlalchemy import text
from sqlalchemy.engine import Connection

logger = logging.getLogger(__name__)

# Each entry is applied exactly once, in order, and never re-run.
# Append new migrations to the END of this list — never edit existing ones.
MIGRATIONS: list[str] = [
    # 001 – add status column to scheduled_tasks
    "ALTER TABLE scheduled_tasks ADD COLUMN status TEXT NOT NULL DEFAULT 'upcoming'",
    # 002 – add goal_id FK to scheduled_tasks
    "ALTER TABLE scheduled_tasks ADD COLUMN goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL",
    # 003 – add category to scheduled_tasks
    "ALTER TABLE scheduled_tasks ADD COLUMN category TEXT",
]


def run_migrations(conn: Connection) -> None:
    conn.execute(text(
        "CREATE TABLE IF NOT EXISTS _schema_migrations "
        "(id INTEGER PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"
    ))

    applied = {row[0] for row in conn.execute(text("SELECT id FROM _schema_migrations"))}

    for i, sql in enumerate(MIGRATIONS):
        if i in applied:
            continue
        try:
            conn.execute(text(sql))
        except Exception as exc:
            if "duplicate column name" in str(exc).lower():
                logger.warning("Migration %03d skipped (column already exists).", i)
            else:
                raise
        conn.execute(text("INSERT INTO _schema_migrations (id) VALUES (:id)"), {"id": i})
        logger.info("Migration %03d applied.", i)

    conn.commit()
