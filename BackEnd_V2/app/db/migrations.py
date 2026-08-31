from sqlalchemy import text
from sqlalchemy.engine import Connection


def _rebuild_plans_source_type(conn: Connection) -> None:
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


def _rebuild_plan_records_source_type(conn: Connection) -> None:
    row = conn.execute(
        text("SELECT sql FROM sqlite_master WHERE type='table' AND name='plan_records'")
    ).fetchone()
    if row is None or (row[0] and "'schedule'" in row[0]):
        return

    columns = (
        "id, user_id, plan_id, source_type, source_id, scheduled_date, title, "
        "planner_type, planner_target, value_unit, priority, preferred_time, "
        "specific_time, duration_minutes, status, actual_value, note, "
        "completed_at, created_at, updated_at"
    )
    conn.execute(text("PRAGMA foreign_keys = OFF"))
    conn.execute(text("ALTER TABLE plan_records RENAME TO plan_records_old"))
    from app.models.plan_record import DailyPlanRecordDBM
    DailyPlanRecordDBM.__table__.create(conn)
    conn.execute(text(f"INSERT INTO plan_records ({columns}) SELECT {columns} FROM plan_records_old"))
    conn.execute(text("DROP TABLE plan_records_old"))
    conn.execute(text("PRAGMA foreign_keys = ON"))


def run_all(conn: Connection) -> None:
    _rebuild_plans_source_type(conn)
    _rebuild_plan_records_source_type(conn)
