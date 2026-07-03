"""expand account and behavior settings

Revision ID: f2a1c0b8d90e
Revises: 93f62db4c201
Create Date: 2026-07-03 19:20:00
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f2a1c0b8d90e"
down_revision: str | None = "93f62db4c201"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("subscription_plan", sa.String(length=40), server_default="free", nullable=False)
        )
        batch_op.add_column(
            sa.Column("email_verified", sa.Boolean(), server_default=sa.false(), nullable=False)
        )
        batch_op.add_column(
            sa.Column("auth_provider", sa.String(length=40), server_default="password", nullable=False)
        )
        batch_op.add_column(
            sa.Column(
                "last_password_changed_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("CURRENT_TIMESTAMP"),
                nullable=False,
            )
        )

    with op.batch_alter_table("user_settings", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("weekly_summary_enabled", sa.Boolean(), server_default=sa.true(), nullable=False)
        )
        batch_op.add_column(
            sa.Column("ai_default_model", sa.String(length=40), server_default="auto", nullable=False)
        )
        batch_op.add_column(
            sa.Column(
                "integration_google_calendar_enabled",
                sa.Boolean(),
                server_default=sa.false(),
                nullable=False,
            )
        )
        batch_op.add_column(
            sa.Column("integration_slack_enabled", sa.Boolean(), server_default=sa.false(), nullable=False)
        )
        batch_op.add_column(
            sa.Column("accessibility_reduced_motion", sa.Boolean(), server_default=sa.false(), nullable=False)
        )
        batch_op.add_column(
            sa.Column("accessibility_high_contrast", sa.Boolean(), server_default=sa.false(), nullable=False)
        )
        batch_op.add_column(
            sa.Column("accessibility_font_scale_percent", sa.Integer(), server_default="100", nullable=False)
        )

    with op.batch_alter_table("planned_tasks", schema=None) as batch_op:
        batch_op.add_column(sa.Column("reminder_time", sa.String(length=5), nullable=True))
        batch_op.add_column(sa.Column("estimated_duration_minutes", sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("planned_tasks", schema=None) as batch_op:
        batch_op.drop_column("estimated_duration_minutes")
        batch_op.drop_column("reminder_time")

    with op.batch_alter_table("user_settings", schema=None) as batch_op:
        batch_op.drop_column("accessibility_font_scale_percent")
        batch_op.drop_column("accessibility_high_contrast")
        batch_op.drop_column("accessibility_reduced_motion")
        batch_op.drop_column("integration_slack_enabled")
        batch_op.drop_column("integration_google_calendar_enabled")
        batch_op.drop_column("ai_default_model")
        batch_op.drop_column("weekly_summary_enabled")

    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("last_password_changed_at")
        batch_op.drop_column("auth_provider")
        batch_op.drop_column("email_verified")
        batch_op.drop_column("subscription_plan")
