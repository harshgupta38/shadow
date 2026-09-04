"""add metric metadata fields

Revision ID: 7c3d91b2ae44
Revises: d9a7f2c1e4b6
Create Date: 2026-07-06 19:40:00
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "7c3d91b2ae44"
down_revision: str | Sequence[str] | None = "d9a7f2c1e4b6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_METRIC_TIME_SPAN = sa.Enum("day", "week", "month", "year", "custom", name="metrictimespan")


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = set(inspector.get_table_names())

    if "tracked_metrics" not in table_names:
        return

    _METRIC_TIME_SPAN.create(bind, checkfirst=True)

    existing_columns = {col["name"] for col in inspector.get_columns("tracked_metrics")}

    with op.batch_alter_table("tracked_metrics") as batch_op:
        if "unit_text" not in existing_columns:
            batch_op.add_column(
                sa.Column("unit_text", sa.String(length=32), nullable=False, server_default="count")
            )
        if "time_span" not in existing_columns:
            batch_op.add_column(
                sa.Column("time_span", _METRIC_TIME_SPAN, nullable=False, server_default="day")
            )
        if "time_span_custom_text" not in existing_columns:
            batch_op.add_column(sa.Column("time_span_custom_text", sa.String(length=64), nullable=True))

    op.execute(
        sa.text(
            """
            UPDATE tracked_metrics
            SET unit_text = CASE unit
                WHEN 'minutes' THEN 'minutes'
                WHEN 'hours' THEN 'hours'
                WHEN 'count' THEN 'count'
                ELSE 'custom'
            END
            WHERE unit_text IS NULL OR unit_text = ''
            """
        )
    )

    refreshed_columns = {col["name"] for col in sa.inspect(bind).get_columns("tracked_metrics")}
    with op.batch_alter_table("tracked_metrics") as batch_op:
        if "unit_text" in refreshed_columns:
            batch_op.alter_column("unit_text", server_default=None)
        if "time_span" in refreshed_columns:
            batch_op.alter_column("time_span", server_default=None)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = set(inspector.get_table_names())

    if "tracked_metrics" not in table_names:
        return

    existing_columns = {col["name"] for col in inspector.get_columns("tracked_metrics")}

    with op.batch_alter_table("tracked_metrics") as batch_op:
        if "time_span_custom_text" in existing_columns:
            batch_op.drop_column("time_span_custom_text")
        if "time_span" in existing_columns:
            batch_op.drop_column("time_span")
        if "unit_text" in existing_columns:
            batch_op.drop_column("unit_text")

    _METRIC_TIME_SPAN.drop(bind, checkfirst=True)
