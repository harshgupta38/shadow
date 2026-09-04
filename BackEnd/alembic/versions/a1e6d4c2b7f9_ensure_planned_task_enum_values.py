"""ensure planned task enum values include ai planner labels

Revision ID: a1e6d4c2b7f9
Revises: f8b7a9d1334e
Create Date: 2026-07-04 22:35:00
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "a1e6d4c2b7f9"
down_revision: str | Sequence[str] | None = "f8b7a9d1334e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _ensure_postgres_enum(type_name: str, values: list[str]) -> None:
    for value in values:
        op.execute(
            f"""
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = '{type_name}')
       AND NOT EXISTS (
           SELECT 1
           FROM pg_enum e
           JOIN pg_type t ON t.oid = e.enumtypid
           WHERE t.typname = '{type_name}'
             AND e.enumlabel = '{value}'
       ) THEN
        EXECUTE 'ALTER TYPE {type_name} ADD VALUE ''{value}''';
    END IF;
END
$$;
"""
        )


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    _ensure_postgres_enum(
        "plannedtasksource",
        ["manual", "ai_generated", "assistant"],
    )
    _ensure_postgres_enum(
        "plannedtaskpriority",
        ["critical", "high", "medium", "low"],
    )


def downgrade() -> None:
    # Enum value removal is intentionally skipped because PostgreSQL does not
    # support dropping enum labels safely in-place for active schemas.
    return
