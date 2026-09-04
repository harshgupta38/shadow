"""add report automation settings

Revision ID: c6f3b1d9e2a7
Revises: a7c5e1d8b2f4
Create Date: 2026-07-07 23:45:00
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c6f3b1d9e2a7"
down_revision: str | Sequence[str] | None = "a7c5e1d8b2f4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("user_settings", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("report_automation_enabled", sa.Boolean(), nullable=False, server_default=sa.true())
        )
        batch_op.add_column(
            sa.Column("report_automation_daily_enabled", sa.Boolean(), nullable=False, server_default=sa.true())
        )
        batch_op.add_column(
            sa.Column("report_automation_daily_time", sa.String(length=5), nullable=False, server_default="23:55")
        )
        batch_op.add_column(
            sa.Column("report_automation_weekly_enabled", sa.Boolean(), nullable=False, server_default=sa.true())
        )
        batch_op.add_column(
            sa.Column(
                "report_automation_weekly_day",
                sa.String(length=16),
                nullable=False,
                server_default="saturday",
            )
        )
        batch_op.add_column(
            sa.Column("report_automation_weekly_time", sa.String(length=5), nullable=False, server_default="23:55")
        )
        batch_op.add_column(
            sa.Column("report_snapshot_include_plan", sa.Boolean(), nullable=False, server_default=sa.true())
        )
        batch_op.add_column(
            sa.Column("report_snapshot_include_goals", sa.Boolean(), nullable=False, server_default=sa.true())
        )
        batch_op.add_column(
            sa.Column("report_snapshot_include_habits", sa.Boolean(), nullable=False, server_default=sa.true())
        )
        batch_op.add_column(
            sa.Column("report_snapshot_include_metrics", sa.Boolean(), nullable=False, server_default=sa.true())
        )
        batch_op.add_column(
            sa.Column(
                "report_snapshot_include_missed_tasks",
                sa.Boolean(),
                nullable=False,
                server_default=sa.true(),
            )
        )
        batch_op.add_column(
            sa.Column("report_snapshot_include_streaks", sa.Boolean(), nullable=False, server_default=sa.true())
        )
        batch_op.add_column(
            sa.Column(
                "report_snapshot_metric_ids_csv",
                sa.String(length=1000),
                nullable=False,
                server_default="",
            )
        )
        batch_op.add_column(
            sa.Column(
                "report_snapshot_habit_ids_csv",
                sa.String(length=1000),
                nullable=False,
                server_default="",
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("user_settings", schema=None) as batch_op:
        batch_op.drop_column("report_snapshot_habit_ids_csv")
        batch_op.drop_column("report_snapshot_metric_ids_csv")
        batch_op.drop_column("report_snapshot_include_streaks")
        batch_op.drop_column("report_snapshot_include_missed_tasks")
        batch_op.drop_column("report_snapshot_include_metrics")
        batch_op.drop_column("report_snapshot_include_habits")
        batch_op.drop_column("report_snapshot_include_goals")
        batch_op.drop_column("report_snapshot_include_plan")
        batch_op.drop_column("report_automation_weekly_time")
        batch_op.drop_column("report_automation_weekly_day")
        batch_op.drop_column("report_automation_weekly_enabled")
        batch_op.drop_column("report_automation_daily_time")
        batch_op.drop_column("report_automation_daily_enabled")
        batch_op.drop_column("report_automation_enabled")
