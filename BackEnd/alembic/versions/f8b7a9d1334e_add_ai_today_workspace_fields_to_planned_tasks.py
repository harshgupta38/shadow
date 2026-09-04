"""add ai today workspace fields to planned tasks

Revision ID: f8b7a9d1334e
Revises: c18f6be4d2a1, af72d620c5e1
Create Date: 2026-07-04 20:10:00
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f8b7a9d1334e"
down_revision: tuple[str, str] | None = ("c18f6be4d2a1", "af72d620c5e1")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("planned_tasks")}
    existing_indexes = {idx["name"] for idx in inspector.get_indexes("planned_tasks")}

    source_enum = sa.Enum(
        "manual",
        "ai_generated",
        "assistant",
        name="plannedtasksource",
    )
    priority_enum = sa.Enum(
        "critical",
        "high",
        "medium",
        "low",
        name="plannedtaskpriority",
    )
    if bind.dialect.name == "postgresql":
        source_enum.create(bind, checkfirst=True)
        priority_enum.create(bind, checkfirst=True)

    with op.batch_alter_table("planned_tasks", schema=None) as batch_op:
        if "source" not in existing_columns:
            batch_op.add_column(
                sa.Column(
                    "source",
                    source_enum,
                    server_default="manual",
                    nullable=False,
                )
            )
        if "priority" not in existing_columns:
            batch_op.add_column(
                sa.Column(
                    "priority",
                    priority_enum,
                    server_default="medium",
                    nullable=False,
                )
            )
        if "ai_rationale" not in existing_columns:
            batch_op.add_column(sa.Column("ai_rationale", sa.Text(), nullable=True))
        if "suggested_start_time" not in existing_columns:
            batch_op.add_column(
                sa.Column("suggested_start_time", sa.String(length=5), nullable=True)
            )
        if "suggested_finish_by_time" not in existing_columns:
            batch_op.add_column(
                sa.Column("suggested_finish_by_time", sa.String(length=5), nullable=True)
            )
        if "execution_order" not in existing_columns:
            batch_op.add_column(sa.Column("execution_order", sa.Integer(), nullable=True))
        if "carried_from_date" not in existing_columns:
            batch_op.add_column(sa.Column("carried_from_date", sa.Date(), nullable=True))
        if "generated_at" not in existing_columns:
            batch_op.add_column(sa.Column("generated_at", sa.DateTime(timezone=True), nullable=True))
        if "ix_planned_tasks_source_date" not in existing_indexes:
            batch_op.create_index(
                "ix_planned_tasks_source_date",
                ["source", "date"],
                unique=False,
            )
        if "ix_planned_tasks_date_execution_order" not in existing_indexes:
            batch_op.create_index(
                "ix_planned_tasks_date_execution_order",
                ["date", "execution_order"],
                unique=False,
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("planned_tasks")}
    existing_indexes = {idx["name"] for idx in inspector.get_indexes("planned_tasks")}

    with op.batch_alter_table("planned_tasks", schema=None) as batch_op:
        if "ix_planned_tasks_date_execution_order" in existing_indexes:
            batch_op.drop_index("ix_planned_tasks_date_execution_order")
        if "ix_planned_tasks_source_date" in existing_indexes:
            batch_op.drop_index("ix_planned_tasks_source_date")
        if "generated_at" in existing_columns:
            batch_op.drop_column("generated_at")
        if "carried_from_date" in existing_columns:
            batch_op.drop_column("carried_from_date")
        if "execution_order" in existing_columns:
            batch_op.drop_column("execution_order")
        if "suggested_finish_by_time" in existing_columns:
            batch_op.drop_column("suggested_finish_by_time")
        if "suggested_start_time" in existing_columns:
            batch_op.drop_column("suggested_start_time")
        if "ai_rationale" in existing_columns:
            batch_op.drop_column("ai_rationale")
        if "priority" in existing_columns:
            batch_op.drop_column("priority")
        if "source" in existing_columns:
            batch_op.drop_column("source")
