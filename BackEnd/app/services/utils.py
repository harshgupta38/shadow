"""Small shared service helpers."""

from __future__ import annotations

from typing import TypeVar

from sqlalchemy.orm import Session

from app.services.exceptions import NotFoundError

T = TypeVar("T")


def get_owned_or_404(
    db: Session,
    model: type[T],
    obj_id: int,
    user_id: int,
    *,
    name: str = "Resource",
) -> T:
    """Fetch ``model`` by id, ensuring it belongs to ``user_id``.

    Raises :class:`NotFoundError` if missing or owned by someone else (we
    return 404 rather than 403 to avoid leaking existence).
    """
    obj = db.get(model, obj_id)
    if obj is None or getattr(obj, "user_id", None) != user_id:
        raise NotFoundError(f"{name} not found")
    return obj
