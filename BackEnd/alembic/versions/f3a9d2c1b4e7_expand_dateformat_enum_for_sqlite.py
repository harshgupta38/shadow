"""expand dateformat enum for sqlite

Revision ID: f3a9d2c1b4e7
Revises: e8c4a1b7d2f3
Create Date: 2026-07-10 00:00:01.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "f3a9d2c1b4e7"
down_revision = "e8c4a1b7d2f3"
branch_labels = None
depends_on = None


_OLD_DATEFORMAT = sa.Enum(
    "dd/mm/yyyy",
    "mm/dd/yyyy",
    "yyyy-mm-dd",
    name="dateformat",
)

_NEW_DATEFORMAT = sa.Enum(
    "dd/mm/yyyy",
    "mm/dd/yyyy",
    "dd-mm-yyyy",
    "mm-dd-yyyy",
    "mmm d, yyyy",
    "yyyy-mm-dd",
    name="dateformat",
)


def upgrade() -> None:
    bind = op.get_bind()

    if bind.dialect.name == "postgresql":
        with op.get_context().autocommit_block():
            op.execute("ALTER TYPE dateformat ADD VALUE IF NOT EXISTS 'dd-mm-yyyy'")
            op.execute("ALTER TYPE dateformat ADD VALUE IF NOT EXISTS 'mm-dd-yyyy'")
            op.execute("ALTER TYPE dateformat ADD VALUE IF NOT EXISTS 'mmm d, yyyy'")
        return

    # SQLite stores SQLAlchemy enums as CHECK constraints. Rebuild column constraint.
    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("user_settings", schema=None) as batch_op:
            batch_op.alter_column(
                "date_format",
                existing_type=_OLD_DATEFORMAT,
                type_=_NEW_DATEFORMAT,
                existing_nullable=False,
            )


def downgrade() -> None:
    bind = op.get_bind()

    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("user_settings", schema=None) as batch_op:
            batch_op.alter_column(
                "date_format",
                existing_type=_NEW_DATEFORMAT,
                type_=_OLD_DATEFORMAT,
                existing_nullable=False,
            )
