"""add shadow response to journal entries

Revision ID: 8e4a7c3f9b21
Revises: f2a1c0b8d90e
Create Date: 2026-07-03 21:05:00
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "8e4a7c3f9b21"
down_revision: str | None = "f2a1c0b8d90e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("journal_entries", schema=None) as batch_op:
        batch_op.add_column(sa.Column("shadow_response", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("journal_entries", schema=None) as batch_op:
        batch_op.drop_column("shadow_response")
