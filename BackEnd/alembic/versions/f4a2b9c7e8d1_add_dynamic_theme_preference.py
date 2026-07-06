"""add dynamic theme preference

Revision ID: f4a2b9c7e8d1
Revises: e6b1f9a2d4c7
Create Date: 2026-07-07 03:35:00
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f4a2b9c7e8d1"
down_revision: str | Sequence[str] | None = "e6b1f9a2d4c7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_OLD_THEME_ENUM = sa.Enum("browser", "light", "dark", name="themepreference")
_NEW_THEME_ENUM = sa.Enum("browser", "dynamic", "light", "dark", name="themepreference")


def _ensure_postgres_theme_enum_dynamic_value() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE themepreference ADD VALUE IF NOT EXISTS 'dynamic'")


def upgrade() -> None:
    bind = op.get_bind()

    if bind.dialect.name == "postgresql":
        _ensure_postgres_theme_enum_dynamic_value()
        return

    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.alter_column(
            "theme_preference",
            existing_type=_OLD_THEME_ENUM,
            type_=_NEW_THEME_ENUM,
            existing_nullable=False,
            existing_server_default="browser",
            server_default="browser",
        )

    with op.batch_alter_table("user_settings", schema=None) as batch_op:
        batch_op.alter_column(
            "theme_preference",
            existing_type=_OLD_THEME_ENUM,
            type_=_NEW_THEME_ENUM,
            existing_nullable=False,
            existing_server_default="browser",
            server_default="browser",
        )


def downgrade() -> None:
    op.execute("UPDATE user_settings SET theme_preference = 'browser' WHERE theme_preference = 'dynamic'")
    op.execute("UPDATE users SET theme_preference = 'browser' WHERE theme_preference = 'dynamic'")

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        # PostgreSQL enum label removal is intentionally skipped.
        return

    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.alter_column(
            "theme_preference",
            existing_type=_NEW_THEME_ENUM,
            type_=_OLD_THEME_ENUM,
            existing_nullable=False,
            existing_server_default="browser",
            server_default="browser",
        )

    with op.batch_alter_table("user_settings", schema=None) as batch_op:
        batch_op.alter_column(
            "theme_preference",
            existing_type=_NEW_THEME_ENUM,
            type_=_OLD_THEME_ENUM,
            existing_nullable=False,
            existing_server_default="browser",
            server_default="browser",
        )
