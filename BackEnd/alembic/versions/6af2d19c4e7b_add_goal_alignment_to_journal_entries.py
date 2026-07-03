"""add goal alignment to journal entries

Revision ID: 6af2d19c4e7b
Revises: 8e4a7c3f9b21
Create Date: 2026-07-03 22:05:00
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "6af2d19c4e7b"
down_revision: str | None = "8e4a7c3f9b21"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("journal_entries", schema=None) as batch_op:
        batch_op.add_column(sa.Column("goal_alignment", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("journal_entries", schema=None) as batch_op:
        batch_op.drop_column("goal_alignment")
