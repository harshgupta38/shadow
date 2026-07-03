"""add details json to milestones

Revision ID: c18f6be4d2a1
Revises: b9d8c120fca4
Create Date: 2026-07-03 22:55:00
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c18f6be4d2a1"
down_revision: str | None = "b9d8c120fca4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("milestones", schema=None) as batch_op:
        batch_op.add_column(sa.Column("details", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("milestones", schema=None) as batch_op:
        batch_op.drop_column("details")
