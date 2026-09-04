"""add accountability fields to planned tasks

Revision ID: c4d1e7a5f2b3
Revises: a1e6d4c2b7f9
Create Date: 2026-07-05 09:10:00
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c4d1e7a5f2b3"
down_revision: str | Sequence[str] | None = "a1e6d4c2b7f9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("planned_tasks")}

    with op.batch_alter_table("planned_tasks", schema=None) as batch_op:
        if "ai_impact_if_skipped" not in existing_columns:
            batch_op.add_column(sa.Column("ai_impact_if_skipped", sa.Text(), nullable=True))
        if "ai_confidence_score" not in existing_columns:
            batch_op.add_column(sa.Column("ai_confidence_score", sa.Integer(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("planned_tasks")}

    with op.batch_alter_table("planned_tasks", schema=None) as batch_op:
        if "ai_confidence_score" in existing_columns:
            batch_op.drop_column("ai_confidence_score")
        if "ai_impact_if_skipped" in existing_columns:
            batch_op.drop_column("ai_impact_if_skipped")
