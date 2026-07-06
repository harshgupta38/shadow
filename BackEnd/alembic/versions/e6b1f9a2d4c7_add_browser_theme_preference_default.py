"""add browser theme preference default

Revision ID: e6b1f9a2d4c7
Revises: 7c3d91b2ae44
Create Date: 2026-07-07 01:20:00
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e6b1f9a2d4c7"
down_revision: str | Sequence[str] | None = "7c3d91b2ae44"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_OLD_THEME_ENUM = sa.Enum("light", "dark", name="themepreference")
_NEW_THEME_ENUM = sa.Enum("browser", "light", "dark", name="themepreference")


def _ensure_postgres_theme_enum_browser_value() -> None:
    # PostgreSQL only allows immediate use of new enum values after commit.
    # Run ADD VALUE in an autocommit block so subsequent default updates can use it.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE themepreference ADD VALUE IF NOT EXISTS 'browser'")


def _set_postgres_theme_defaults() -> None:
    op.execute("ALTER TABLE users ALTER COLUMN theme_preference SET DEFAULT 'browser'")
    op.execute("ALTER TABLE user_settings ALTER COLUMN theme_preference SET DEFAULT 'browser'")


def _drop_postgres_theme_defaults() -> None:
    op.execute("ALTER TABLE users ALTER COLUMN theme_preference DROP DEFAULT")
    op.execute("ALTER TABLE user_settings ALTER COLUMN theme_preference DROP DEFAULT")


def upgrade() -> None:
    bind = op.get_bind()

    if bind.dialect.name == "postgresql":
        _ensure_postgres_theme_enum_browser_value()
        _set_postgres_theme_defaults()
        return

    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.alter_column(
            "theme_preference",
            existing_type=_OLD_THEME_ENUM,
            type_=_NEW_THEME_ENUM,
            existing_nullable=False,
            server_default="browser",
        )

    with op.batch_alter_table("user_settings", schema=None) as batch_op:
        batch_op.alter_column(
            "theme_preference",
            existing_type=_OLD_THEME_ENUM,
            type_=_NEW_THEME_ENUM,
            existing_nullable=False,
            server_default="browser",
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        _drop_postgres_theme_defaults()

    # Normalize unsupported values before enum rollback.
    op.execute("UPDATE user_settings SET theme_preference = 'light' WHERE theme_preference = 'browser'")
    op.execute("UPDATE users SET theme_preference = 'light' WHERE theme_preference = 'browser'")

    if bind.dialect.name == "postgresql":
        # PostgreSQL enum label removal is intentionally skipped.
        return

    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.alter_column(
            "theme_preference",
            existing_type=_NEW_THEME_ENUM,
            type_=_OLD_THEME_ENUM,
            existing_nullable=False,
            server_default=None,
        )

    with op.batch_alter_table("user_settings", schema=None) as batch_op:
        batch_op.alter_column(
            "theme_preference",
            existing_type=_NEW_THEME_ENUM,
            type_=_OLD_THEME_ENUM,
            existing_nullable=False,
            server_default=None,
        )
