"""add schedule fields to planned tasks

Revision ID: b2f7c4d9e1a8
Revises: e6b1f9a2d4c7
Create Date: 2026-07-07 20:00:00
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b2f7c4d9e1a8"
down_revision: str | Sequence[str] | None = "e6b1f9a2d4c7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = set(inspector.get_table_names())

    if "planned_tasks" not in table_names:
        return

    existing_columns = {col["name"] for col in inspector.get_columns("planned_tasks")}
    existing_indexes = {idx["name"] for idx in inspector.get_indexes("planned_tasks")}
    existing_foreign_keys = inspector.get_foreign_keys("planned_tasks")
    linked_habit_fk_name = next(
        (
            fk.get("name")
            for fk in existing_foreign_keys
            if "linked_habit_id" in (fk.get("constrained_columns") or [])
        ),
        None,
    )
    has_linked_habit_fk = linked_habit_fk_name is not None

    with op.batch_alter_table("planned_tasks") as batch_op:
        if "description" not in existing_columns:
            batch_op.add_column(sa.Column("description", sa.Text(), nullable=True))

        if "linked_habit_id" not in existing_columns:
            batch_op.add_column(sa.Column("linked_habit_id", sa.Integer(), nullable=True))

        if not has_linked_habit_fk:
            batch_op.create_foreign_key(
                "fk_planned_tasks_linked_habit_id_repetitive_tasks",
                "repetitive_tasks",
                ["linked_habit_id"],
                ["id"],
                ondelete="SET NULL",
            )

        if "ix_planned_tasks_linked_habit_id" not in existing_indexes:
            batch_op.create_index("ix_planned_tasks_linked_habit_id", ["linked_habit_id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = set(inspector.get_table_names())

    if "planned_tasks" not in table_names:
        return

    existing_columns = {col["name"] for col in inspector.get_columns("planned_tasks")}
    existing_indexes = {idx["name"] for idx in inspector.get_indexes("planned_tasks")}
    existing_foreign_keys = inspector.get_foreign_keys("planned_tasks")
    linked_habit_fk_name = next(
        (
            fk.get("name")
            for fk in existing_foreign_keys
            if "linked_habit_id" in (fk.get("constrained_columns") or [])
        ),
        None,
    )
    has_linked_habit_fk = linked_habit_fk_name is not None

    with op.batch_alter_table("planned_tasks") as batch_op:
        if "ix_planned_tasks_linked_habit_id" in existing_indexes:
            batch_op.drop_index("ix_planned_tasks_linked_habit_id")

        if has_linked_habit_fk:
            batch_op.drop_constraint(
                linked_habit_fk_name or "fk_planned_tasks_linked_habit_id_repetitive_tasks",
                type_="foreignkey",
            )

        if "linked_habit_id" in existing_columns:
            batch_op.drop_column("linked_habit_id")

        if "description" in existing_columns:
            batch_op.drop_column("description")
