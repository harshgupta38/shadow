"""add goal id to chat sessions

Revision ID: b9d8c120fca4
Revises: 6af2d19c4e7b
Create Date: 2026-07-03 23:15:00
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b9d8c120fca4"
down_revision: str | None = "6af2d19c4e7b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("chat_sessions", schema=None) as batch_op:
        batch_op.add_column(sa.Column("goal_id", sa.Integer(), nullable=True))
        batch_op.create_index("ix_chat_sessions_goal_id", ["goal_id"], unique=False)
        batch_op.create_foreign_key(
            "fk_chat_sessions_goal_id_goals",
            "goals",
            ["goal_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("chat_sessions", schema=None) as batch_op:
        batch_op.drop_constraint("fk_chat_sessions_goal_id_goals", type_="foreignkey")
        batch_op.drop_index("ix_chat_sessions_goal_id")
        batch_op.drop_column("goal_id")
