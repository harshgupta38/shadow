"""add repetitive tasks domain

Revision ID: af72d620c5e1
Revises: 6af2d19c4e7b
Create Date: 2026-07-04 16:10:00
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "af72d620c5e1"
down_revision: str | None = "6af2d19c4e7b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "repetitive_tasks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("frequencies", sa.JSON(), nullable=False),
        sa.Column(
            "priority",
            sa.Enum(
                "critical",
                "high",
                "medium",
                "low",
                name="repetitivetaskpriority",
            ),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum("active", "paused", "archived", name="repetitivetaskstatus"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("repetitive_tasks", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_repetitive_tasks_user_id"), ["user_id"], unique=False)

    op.create_table(
        "repetitive_task_goals",
        sa.Column("repetitive_task_id", sa.Integer(), nullable=False),
        sa.Column("goal_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["goal_id"], ["goals.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["repetitive_task_id"],
            ["repetitive_tasks.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("repetitive_task_id", "goal_id"),
    )
    with op.batch_alter_table("repetitive_task_goals", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_repetitive_task_goals_goal_id"),
            ["goal_id"],
            unique=False,
        )

    op.create_table(
        "repetitive_task_metrics",
        sa.Column("repetitive_task_id", sa.Integer(), nullable=False),
        sa.Column("metric_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["metric_id"], ["tracked_metrics.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["repetitive_task_id"],
            ["repetitive_tasks.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("repetitive_task_id", "metric_id"),
    )
    with op.batch_alter_table("repetitive_task_metrics", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_repetitive_task_metrics_metric_id"),
            ["metric_id"],
            unique=False,
        )


def downgrade() -> None:
    with op.batch_alter_table("repetitive_task_metrics", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_repetitive_task_metrics_metric_id"))
    op.drop_table("repetitive_task_metrics")

    with op.batch_alter_table("repetitive_task_goals", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_repetitive_task_goals_goal_id"))
    op.drop_table("repetitive_task_goals")

    with op.batch_alter_table("repetitive_tasks", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_repetitive_tasks_user_id"))
    op.drop_table("repetitive_tasks")
