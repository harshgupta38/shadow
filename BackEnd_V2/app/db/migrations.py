import json

from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from sqlalchemy.schema import CreateIndex, CreateTable

from app.models.chat import ConversationDBM
from app.models.diet_profile import DietProfileDBM
from app.models.workout_session import OPEN_SESSION_WHERE


def add_column_if_missing(conn, table: str, column: str, ddl: str) -> None:
    """Runs an ADD COLUMN unless the column is already there. Workers start together, so another one may add it first."""
    existing = {row[1] for row in conn.execute(text(f"PRAGMA table_info({table})")).fetchall()}
    if column in existing:
        return
    try:
        conn.execute(text(ddl))
        conn.commit()
    except OperationalError as exc:  # another worker added the column first
        if "duplicate column name" not in str(exc):
            raise


def _fold_session_sets_into_exercises(conn) -> None:
    """Moves each session's sets from workout_session_sets into a JSON column on its exercise row, then drops the old table.

    One transaction. BEGIN IMMEDIATE makes workers that start together take turns, so the second one finds nothing left to do.
    """
    conn.exec_driver_sql("BEGIN IMMEDIATE")
    try:
        tables = {row[0] for row in conn.execute(text("SELECT name FROM sqlite_master WHERE type = 'table'"))}
        if "workout_session_sets" in tables:
            conn.execute(text("ALTER TABLE workout_session_exercises ADD COLUMN sets JSON NOT NULL DEFAULT '[]'"))
            sets_by_entry: dict[int, list[dict]] = {}
            rows = conn.execute(
                text("SELECT session_exercise_id, reps, weight_kg, done FROM workout_session_sets ORDER BY session_exercise_id, position")
            ).fetchall()
            for entry_id, reps, weight_kg, done in rows:
                sets_by_entry.setdefault(entry_id, []).append({"reps": reps, "weight_kg": weight_kg, "done": bool(done)})
            for entry_id, sets in sets_by_entry.items():
                conn.execute(
                    text("UPDATE workout_session_exercises SET sets = :sets WHERE id = :id"),
                    {"sets": json.dumps(sets), "id": entry_id},
                )
            conn.execute(text("DROP TABLE workout_session_sets"))
        conn.commit()
    except Exception:
        conn.rollback()
        raise


def migrate_subscriptions(engine) -> None:
    """Gives every user the plan columns, and daily_usage the column for tokens spent with a person's own key, then moves the plans out of the old subscriptions table onto the users and drops it.
    Accounts without a row there keep the column default, the free plan. The columns are added first and outside the copy, so
    a crash between the steps leaves the old table in place for the next start. One transaction for the copy, and BEGIN IMMEDIATE
    makes workers that start together take turns, so the second one finds the table already gone. Idempotent."""
    with engine.connect() as conn:
        add_column_if_missing(conn, "users", "plan_code", "ALTER TABLE users ADD COLUMN plan_code VARCHAR(20) NOT NULL DEFAULT 'free'")
        add_column_if_missing(conn, "users", "plan_expires_at", "ALTER TABLE users ADD COLUMN plan_expires_at DATETIME")
        add_column_if_missing(conn, "daily_usage", "own_key_tokens", "ALTER TABLE daily_usage ADD COLUMN own_key_tokens INTEGER NOT NULL DEFAULT 0")
        conn.exec_driver_sql("BEGIN IMMEDIATE")
        try:
            tables = {row[0] for row in conn.execute(text("SELECT name FROM sqlite_master WHERE type = 'table'"))}
            if "subscriptions" in tables:
                conn.execute(
                    text(
                        "UPDATE users SET "
                        "plan_code = (SELECT plan_code FROM subscriptions WHERE subscriptions.user_id = users.id), "
                        "plan_expires_at = (SELECT expires_at FROM subscriptions WHERE subscriptions.user_id = users.id) "
                        "WHERE id IN (SELECT user_id FROM subscriptions)"
                    )
                )
                conn.execute(text("DROP TABLE subscriptions"))
            conn.commit()
        except Exception:
            conn.rollback()
            raise


def _backfill_plan_weekday(conn) -> None:
    """Open workouts started before plan_weekday existed take the weekday of their plan day while that day is still
    linked. Once a plan edit has unlinked the day, the weekday of the start date stands in: the app only starts the plan
    day of today's weekday, so the two agree. A workout of a deleted plan keeps NULL. Idempotent."""
    conn.execute(
        text(
            "UPDATE workout_sessions SET plan_weekday = COALESCE("
            "(SELECT workout_plan_days.weekday FROM workout_plan_days WHERE workout_plan_days.id = workout_sessions.plan_day_id), "
            "CAST(strftime('%w', workout_sessions.session_date) AS INTEGER)) "
            f"WHERE {OPEN_SESSION_WHERE} AND plan_weekday IS NULL AND plan_id IS NOT NULL"
        )
    )
    conn.commit()


def migrate_workout(engine) -> None:
    """Brings a database created before the current workout schema up to date. Every step is idempotent, so workers
    that start together can all run it."""
    with engine.connect() as conn:
        add_column_if_missing(
            conn, "workout_exercises", "kind",
            "ALTER TABLE workout_exercises ADD COLUMN kind VARCHAR(16) NOT NULL DEFAULT 'strength'",
        )
        add_column_if_missing(
            conn, "workout_exercises", "measure",
            "ALTER TABLE workout_exercises ADD COLUMN measure VARCHAR(12) NOT NULL DEFAULT 'reps'",
        )
        add_column_if_missing(
            conn, "workout_exercises", "equipment_type",
            "ALTER TABLE workout_exercises ADD COLUMN equipment_type VARCHAR(16) NOT NULL DEFAULT 'heavy_equipment'",
        )
        add_column_if_missing(
            conn, "workout_settings", "active_plan_started_on",
            "ALTER TABLE workout_settings ADD COLUMN active_plan_started_on DATE",
        )
        _fold_session_sets_into_exercises(conn)
        add_column_if_missing(
            conn, "workout_sessions", "plan_weekday",
            "ALTER TABLE workout_sessions ADD COLUMN plan_weekday INTEGER CHECK (plan_weekday IS NULL OR plan_weekday BETWEEN 0 AND 6)",
        )
        _backfill_plan_weekday(conn)


def _rebuild_diet_profiles_if_outdated(engine) -> None:
    """SQLite cannot change a CHECK constraint in place. A diet_profiles table made before non-vegetarian and the height
    unit existed keeps the old constraints, so its rows are copied into a table built from the current model. Runs inside
    BEGIN IMMEDIATE: workers that start together take turns, and the one that comes second finds the table already rebuilt."""
    table = DietProfileDBM.__table__
    with engine.connect() as conn:
        # Foreign keys are off for the copy, as SQLite's guide to rebuilding a table asks. The switch does nothing inside a
        # transaction, so it comes first, and it is turned back on however the rebuild ends.
        conn.exec_driver_sql("PRAGMA foreign_keys=OFF")
        try:
            conn.exec_driver_sql("BEGIN IMMEDIATE")
            current = conn.execute(
                text("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'diet_profiles'")
            ).scalar()
            if current is None or ("'non_vegetarian'" in current and "height_unit" in current):
                conn.rollback()
                return
            # The model's own CREATE TABLE, with only the name changed: a copy of the table in another MetaData
            # cannot resolve its foreign key to users.
            ddl = str(CreateTable(table).compile(dialect=conn.dialect)).replace(
                "CREATE TABLE diet_profiles (", "CREATE TABLE diet_profiles_rebuild (", 1
            )
            conn.exec_driver_sql(ddl)
            existing = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(diet_profiles)")}
            shared = ", ".join(column.name for column in table.columns if column.name in existing)
            conn.exec_driver_sql(f"INSERT INTO diet_profiles_rebuild ({shared}) SELECT {shared} FROM diet_profiles")
            conn.exec_driver_sql("DROP TABLE diet_profiles")
            conn.exec_driver_sql("ALTER TABLE diet_profiles_rebuild RENAME TO diet_profiles")
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.exec_driver_sql("PRAGMA foreign_keys=ON")


def migrate_diet(engine) -> None:
    """Brings diet_profiles up to date: the unit the height was typed in, and the rebuilt table for the eating styles.
    Idempotent, like the workout migration."""
    with engine.connect() as conn:
        add_column_if_missing(
            conn, "diet_profiles", "height_unit",
            "ALTER TABLE diet_profiles ADD COLUMN height_unit VARCHAR(8) NOT NULL DEFAULT 'cm'",
        )
    _rebuild_diet_profiles_if_outdated(engine)


def migrate_countdowns(engine) -> None:
    """Adds the link from a scheduled task to its countdown to databases created before countdowns. Idempotent."""
    with engine.connect() as conn:
        add_column_if_missing(
            conn, "scheduled_tasks", "countdown_id",
            "ALTER TABLE scheduled_tasks ADD COLUMN countdown_id INTEGER REFERENCES countdowns(id) ON DELETE SET NULL",
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_scheduled_tasks_countdown_id ON scheduled_tasks (countdown_id)"))
        conn.commit()


def migrate_water_logs(engine) -> None:
    """Collapse any multi-row (user, day) pairs into one row storing the daily total, and add a UNIQUE constraint.
    Old schema: CHECK(amount_ml BETWEEN 1 AND 5000), multiple rows per day.
    New schema: CHECK(amount_ml >= 0), UNIQUE(user_id, log_date).
    Idempotent: skips when the unique constraint is already present."""
    with engine.connect() as conn:
        current = conn.execute(
            text("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'water_logs'")
        ).scalar()
        if current is None or "uq_water_logs_user_date" in current:
            return  # table missing (will be created fresh) or already migrated

        conn.exec_driver_sql("PRAGMA foreign_keys=OFF")
        try:
            conn.exec_driver_sql("BEGIN IMMEDIATE")
            conn.exec_driver_sql("""
                CREATE TABLE water_logs_rebuild (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    log_date DATE NOT NULL,
                    amount_ml INTEGER NOT NULL CHECK (amount_ml >= 0),
                    created_at DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
                    CONSTRAINT uq_water_logs_user_date UNIQUE (user_id, log_date)
                )
            """)
            conn.exec_driver_sql("""
                INSERT INTO water_logs_rebuild (user_id, log_date, amount_ml)
                SELECT user_id, log_date,
                       CASE WHEN SUM(amount_ml) > 0 THEN SUM(amount_ml) ELSE 0 END
                FROM water_logs
                GROUP BY user_id, log_date
            """)
            conn.exec_driver_sql("DROP TABLE water_logs")
            conn.exec_driver_sql("ALTER TABLE water_logs_rebuild RENAME TO water_logs")
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.exec_driver_sql("PRAGMA foreign_keys=ON")


def migrate_conversations(engine) -> None:
    """SQLite cannot change a CHECK constraint in place. A conversations table made before the Workout Coach existed only allows the
    older agent types, so its rows are copied into a table built from the current model and its indexes are made again. The
    messages that point at the conversations keep their links: the copy keeps every id. Idempotent, and safe when workers start
    together: BEGIN IMMEDIATE makes them take turns, and the one that comes second finds the table already rebuilt."""
    table = ConversationDBM.__table__
    with engine.connect() as conn:
        conn.exec_driver_sql("PRAGMA foreign_keys=OFF")  # does nothing inside a transaction, so it comes first
        try:
            conn.exec_driver_sql("BEGIN IMMEDIATE")
            current = conn.execute(text("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'conversations'")).scalar()
            if current is None or "'workout_coach'" in current:
                conn.rollback()
                return
            ddl = str(CreateTable(table).compile(dialect=conn.dialect)).replace(
                "CREATE TABLE conversations (", "CREATE TABLE conversations_rebuild (", 1
            )
            conn.exec_driver_sql(ddl)
            existing = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(conversations)")}
            shared = ", ".join(column.name for column in table.columns if column.name in existing)
            conn.exec_driver_sql(f"INSERT INTO conversations_rebuild ({shared}) SELECT {shared} FROM conversations")
            conn.exec_driver_sql("DROP TABLE conversations")  # takes its indexes with it
            conn.exec_driver_sql("ALTER TABLE conversations_rebuild RENAME TO conversations")
            for index in table.indexes:
                conn.exec_driver_sql(str(CreateIndex(index).compile(dialect=conn.dialect)))
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.exec_driver_sql("PRAGMA foreign_keys=ON")
