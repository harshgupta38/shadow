"""add profile and settings domains

Revision ID: 93f62db4c201
Revises: d431dfd7dcd9
Create Date: 2026-07-02 22:05:00
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "93f62db4c201"
down_revision: str | None = "d431dfd7dcd9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_profiles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=True),
        sa.Column("profile_picture_url", sa.String(length=512), nullable=True),
        sa.Column("current_role", sa.String(length=160), nullable=True),
        sa.Column("current_goal", sa.String(length=255), nullable=True),
        sa.Column("phone_number", sa.String(length=40), nullable=True),
        sa.Column("short_bio", sa.Text(), nullable=True),
        sa.Column("profession", sa.String(length=160), nullable=True),
        sa.Column("industry", sa.String(length=120), nullable=True),
        sa.Column("experience_summary", sa.Text(), nullable=True),
        sa.Column("primary_tech_stack", sa.Text(), nullable=True),
        sa.Column("current_company", sa.String(length=160), nullable=True),
        sa.Column("dream_company", sa.String(length=160), nullable=True),
        sa.Column("interview_preparation_status", sa.String(length=160), nullable=True),
        sa.Column("long_term_vision", sa.Text(), nullable=True),
        sa.Column("current_goals_overview", sa.Text(), nullable=True),
        sa.Column("daily_routine", sa.Text(), nullable=True),
        sa.Column("working_style", sa.Text(), nullable=True),
        sa.Column("learning_profile", sa.Text(), nullable=True),
        sa.Column("productivity_preferences", sa.Text(), nullable=True),
        sa.Column("motivation", sa.Text(), nullable=True),
        sa.Column("always_remember", sa.Text(), nullable=True),
        sa.Column("profile_version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    with op.batch_alter_table("user_profiles", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_user_profiles_user_id"), ["user_id"], unique=True)

    op.create_table(
        "user_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column(
            "theme_preference",
            sa.Enum("light", "dark", name="themepreference", create_type=False),
            nullable=False,
        ),
        sa.Column("notifications_enabled", sa.Boolean(), nullable=False),
        sa.Column("push_notifications_enabled", sa.Boolean(), nullable=False),
        sa.Column("email_notifications_enabled", sa.Boolean(), nullable=False),
        sa.Column("reminder_notifications_enabled", sa.Boolean(), nullable=False),
        sa.Column("daily_brief_enabled", sa.Boolean(), nullable=False),
        sa.Column("daily_brief_time", sa.String(length=5), nullable=False),
        sa.Column(
            "ai_response_length",
            sa.Enum("short", "balanced", "detailed", "very_detailed", name="airesponselength"),
            nullable=False,
        ),
        sa.Column(
            "ai_personality",
            sa.Enum(
                "professional",
                "friendly",
                "coach",
                "teacher",
                "mentor",
                "minimal",
                name="aipersonality",
            ),
            nullable=False,
        ),
        sa.Column("ai_suggestions_enabled", sa.Boolean(), nullable=False),
        sa.Column("smart_planning_enabled", sa.Boolean(), nullable=False),
        sa.Column(
            "week_starts_on",
            sa.Enum("monday", "sunday", name="weekstartson"),
            nullable=False,
        ),
        sa.Column("default_reminder_time", sa.String(length=5), nullable=False),
        sa.Column("default_task_duration_minutes", sa.Integer(), nullable=False),
        sa.Column(
            "time_format",
            sa.Enum("12h", "24h", name="timeformat"),
            nullable=False,
        ),
        sa.Column(
            "date_format",
            sa.Enum("dd/mm/yyyy", "mm/dd/yyyy", "yyyy-mm-dd", name="dateformat"),
            nullable=False,
        ),
        sa.Column("analytics_opt_out", sa.Boolean(), nullable=False),
        sa.Column("ai_memory_enabled", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    with op.batch_alter_table("user_settings", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_user_settings_user_id"), ["user_id"], unique=True)


def downgrade() -> None:
    with op.batch_alter_table("user_settings", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_user_settings_user_id"))

    op.drop_table("user_settings")

    with op.batch_alter_table("user_profiles", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_user_profiles_user_id"))

    op.drop_table("user_profiles")
