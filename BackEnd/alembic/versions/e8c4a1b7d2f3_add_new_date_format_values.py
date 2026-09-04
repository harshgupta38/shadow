"""add new date format values

Revision ID: e8c4a1b7d2f3
Revises: 1e4b7c9a2f6d, b2f7c4d9e1a8
Create Date: 2026-07-10 00:00:00.000000
"""

from __future__ import annotations

from alembic import op


# revision identifiers, used by Alembic.
revision = "e8c4a1b7d2f3"
down_revision = ("1e4b7c9a2f6d", "b2f7c4d9e1a8")
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE dateformat ADD VALUE IF NOT EXISTS 'dd-mm-yyyy'")
        op.execute("ALTER TYPE dateformat ADD VALUE IF NOT EXISTS 'mm-dd-yyyy'")
        op.execute("ALTER TYPE dateformat ADD VALUE IF NOT EXISTS 'mmm d, yyyy'")


def downgrade() -> None:
    # Postgres enum value removal is intentionally skipped to avoid destructive rewrites.
    pass
