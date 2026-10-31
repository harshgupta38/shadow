"""Keeps the shared food library in the database in step with app/data/diet/foods.json.

Runs at startup. Each row stores a fingerprint of the spec it was built from, so a normal restart writes
nothing and editing the JSON file updates only the rows that changed. Foods users created are never touched.
"""

import hashlib
import json
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.diet import FoodDBM

_DATA_FILE = Path(__file__).resolve().parents[1] / "data" / "diet" / "foods.json"

_FOOD_FIELDS = (
    "name",
    "alt_names",
    "category",
    "cuisine",
    "prep_method",
    "diet_tags",
    "calories",
    "protein_g",
    "carbs_g",
    "fat_g",
    "fibre_g",
    "micronutrients",
    "serving_grams",
    "default_unit",
    "default_quantity",
    "source",
    "verification",
    "confidence",
)


def build_search_text(name: str, alt_names: list[str]) -> str:
    return " ".join([name.lower(), *(alt.lower() for alt in alt_names)])


def _fingerprint(spec: dict) -> str:
    return hashlib.sha256(json.dumps({field: spec[field] for field in _FOOD_FIELDS}, sort_keys=True).encode("utf-8")).hexdigest()


def sync_seed(db: Session) -> None:
    """Makes the shared library match the bundled JSON. Library foods dropped from the JSON are left in place,
    because logged history only snapshots values and users may still have them as favourites."""
    for position, spec in enumerate(json.loads(_DATA_FILE.read_text(encoding="utf-8"))):
        row = db.scalar(select(FoodDBM).where(FoodDBM.slug == spec["slug"]))
        if row is None:
            row = FoodDBM(slug=spec["slug"], user_id=None)
            db.add(row)
        fingerprint = _fingerprint(spec)
        if row.seed_hash != fingerprint:
            for field in _FOOD_FIELDS:
                setattr(row, field, spec[field])
            row.search_text = build_search_text(spec["name"], spec["alt_names"])
            row.seed_hash = fingerprint
        row.position = position
    db.commit()
