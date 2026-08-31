from sqlalchemy import text
from sqlalchemy.engine import Connection


def _migrate_plans_source_type(conn: Connection) -> None:
    """Rebuild plans table if ck_plan_source_type is missing 'schedule'."""
    row = conn.execute(
        text("SELECT sql FROM sqlite_master WHERE type='table' AND name='plans'")
    ).fetchone()

    if row is None or (row[0] and "'schedule'" in row[0]):
        return

    columns = (
        "id, user_id, source_type, source_id, title, planner_type, planner_target, "
        "value_unit, frequencies, weekly_count, monthly_count, specific_days, "
        "day_fallback, preferred_time, specific_time, duration_minutes, priority, "
        "start_date, end_date, status, created_at, updated_at"
    )

    conn.execute(text("PRAGMA foreign_keys = OFF"))
    conn.execute(text("ALTER TABLE plans RENAME TO plans_old"))

    from app.models.plan import PlanDBM
    PlanDBM.__table__.create(conn)

    conn.execute(text(f"INSERT INTO plans ({columns}) SELECT {columns} FROM plans_old"))
    conn.execute(text("DROP TABLE plans_old"))
    conn.execute(text("PRAGMA foreign_keys = ON"))


def run_all(conn: Connection) -> None:
    _migrate_plans_source_type(conn)
