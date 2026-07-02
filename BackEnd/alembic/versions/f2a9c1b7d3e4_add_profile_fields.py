"""add profile and AI profile fields to users

Revision ID: f2a9c1b7d3e4
Revises: d431dfd7dcd9
Create Date: 2026-07-02 12:00:00.000000
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f2a9c1b7d3e4"
down_revision: str | None = "d431dfd7dcd9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        # Basic profile
        batch_op.add_column(sa.Column("display_name", sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column("phone", sa.String(length=40), nullable=True))
        batch_op.add_column(sa.Column("bio", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("avatar_url", sa.String(length=512), nullable=True))
        batch_op.add_column(
            sa.Column(
                "email_verified",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )
        # AI profile
        batch_op.add_column(sa.Column("profession", sa.String(length=160), nullable=True))
        batch_op.add_column(sa.Column("working_hours", sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column("working_style", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("interests", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("learning_focus", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("long_term_vision", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("daily_routine", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("current_goals", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("ai_notes", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("ai_notes")
        batch_op.drop_column("current_goals")
        batch_op.drop_column("daily_routine")
        batch_op.drop_column("long_term_vision")
        batch_op.drop_column("learning_focus")
        batch_op.drop_column("interests")
        batch_op.drop_column("working_style")
        batch_op.drop_column("working_hours")
        batch_op.drop_column("profession")
        batch_op.drop_column("email_verified")
        batch_op.drop_column("avatar_url")
        batch_op.drop_column("bio")
        batch_op.drop_column("phone")
        batch_op.drop_column("display_name")
