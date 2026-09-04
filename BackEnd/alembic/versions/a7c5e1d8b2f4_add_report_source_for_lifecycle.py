"""add report source for lifecycle

Revision ID: a7c5e1d8b2f4
Revises: f4a2b9c7e8d1
Create Date: 2026-07-07 22:10:00
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a7c5e1d8b2f4"
down_revision: str | Sequence[str] | None = "f4a2b9c7e8d1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_REPORT_SOURCE_ENUM = sa.Enum("manual", "automatic", name="reportsource")


def upgrade() -> None:
    bind = op.get_bind()

    if bind.dialect.name == "postgresql":
        _REPORT_SOURCE_ENUM.create(bind, checkfirst=True)
        op.add_column(
            "reports",
            sa.Column("source", _REPORT_SOURCE_ENUM, nullable=False, server_default="manual"),
        )
        op.execute("UPDATE reports SET source = 'manual' WHERE source IS NULL")
        op.alter_column("reports", "source", server_default=None)
        return

    with op.batch_alter_table("reports", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("source", _REPORT_SOURCE_ENUM, nullable=False, server_default="manual")
        )

    with op.batch_alter_table("reports", schema=None) as batch_op:
        batch_op.alter_column("source", server_default=None)


def downgrade() -> None:
    bind = op.get_bind()

    with op.batch_alter_table("reports", schema=None) as batch_op:
        batch_op.drop_column("source")

    if bind.dialect.name == "postgresql":
        _REPORT_SOURCE_ENUM.drop(bind, checkfirst=True)
