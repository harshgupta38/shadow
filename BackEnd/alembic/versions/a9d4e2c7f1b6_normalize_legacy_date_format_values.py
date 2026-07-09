"""normalize legacy date_format values

Revision ID: a9d4e2c7f1b6
Revises: f3a9d2c1b4e7
Create Date: 2026-07-10 01:05:00.000000
"""

from __future__ import annotations

from alembic import op


# revision identifiers, used by Alembic.
revision = "a9d4e2c7f1b6"
down_revision = "f3a9d2c1b4e7"
branch_labels = None
depends_on = None


_LEGACY_TO_CANONICAL = {
    "dd_mm_yyyy": "dd/mm/yyyy",
    "mm_dd_yyyy": "mm/dd/yyyy",
    "dd_mm_yyyy_dash": "dd-mm-yyyy",
    "mm_dd_yyyy_dash": "mm-dd-yyyy",
    "mmm_d_yyyy": "mmm d, yyyy",
    "yyyy_mm_dd": "yyyy-mm-dd",
    # Defensive mapping for values seen in logs/screenshots.
    "mm_d_yyyy": "mm/dd/yyyy",
}


def upgrade() -> None:
    bind = op.get_bind()

    if bind.dialect.name == "postgresql":
        # First, rename legacy enum labels to canonical runtime values when possible.
        # This keeps the enum type compatible with values persisted by the API layer.
        for legacy, canonical in _LEGACY_TO_CANONICAL.items():
            op.execute(
                f"""
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'dateformat' AND e.enumlabel = '{legacy}'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'dateformat' AND e.enumlabel = '{canonical}'
  ) THEN
    EXECUTE 'ALTER TYPE dateformat RENAME VALUE ''{legacy}'' TO ''{canonical}''';
  END IF;
END$$;
                """
            )

        # If both labels coexist in any environment, normalize row values too.
        for legacy, canonical in _LEGACY_TO_CANONICAL.items():
            op.execute(
                f"UPDATE user_settings SET date_format = '{canonical}' WHERE date_format::text = '{legacy}'"
            )
        return

    for legacy, canonical in _LEGACY_TO_CANONICAL.items():
        op.execute(
            f"UPDATE user_settings SET date_format = '{canonical}' WHERE date_format = '{legacy}'"
        )


def downgrade() -> None:
    # Data normalization is intentionally irreversible.
    pass
