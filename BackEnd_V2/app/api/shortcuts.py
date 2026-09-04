import re

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.endpoints import ENDPOINTS
from app.core.exceptions import AuthError
from app.db.session import get_db
from app.services.auth_service import login_user
from app.services import planner_service

router = APIRouter(prefix=ENDPOINTS.SHORTCUTS.PREFIX, tags=["shortcuts"])

_PLANNER_RECORD_RE = re.compile(
    (ENDPOINTS.PLANNER.PREFIX + ENDPOINTS.PLANNER.RECORD).replace("{record_id}", r"(\d+)")
)


class ShortcutUpdate(BaseModel):
    add_value: int | None = None


class ShortcutUpdateRequest(BaseModel):
    path: str
    update: ShortcutUpdate


@router.post(ENDPOINTS.SHORTCUTS.UPDATE)
def shortcut_update(
    body: ShortcutUpdateRequest,
    x_user_email: str = Header(...),
    x_user_password: str = Header(...),
    db: Session = Depends(get_db),
):
    try:
        user = login_user(db, x_user_email, x_user_password)
    except AuthError:
        raise HTTPException(status_code=401, detail="Invalid credentials.")

    match = _PLANNER_RECORD_RE.fullmatch(body.path)
    if match:
        if body.update.add_value is None:
            raise HTTPException(status_code=400, detail="No update operation provided.")
        return planner_service.update_daily_record(
            db=db,
            current_user=user,
            record_id=int(match.group(1)),
            status=None,
            actual_value=None,
            note=None,
            add_value=body.update.add_value,
        )

    raise HTTPException(status_code=400, detail=f"Unsupported path: {body.path}")
