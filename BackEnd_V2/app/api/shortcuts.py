from datetime import date

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.endpoints import ENDPOINTS
from app.core.exceptions import AuthError
from app.db.session import get_db
from app.models.plan_record import DailyPlanRecordDBM
from app.services.auth_service import login_user
from app.services import planner_service

router = APIRouter(prefix=ENDPOINTS.SHORTCUTS.PREFIX, tags=["shortcuts"])

_PLANNER_RECORDS_PATH = ENDPOINTS.PLANNER.PREFIX + ENDPOINTS.PLANNER.RECORDS


class ShortcutUpdateRequest(BaseModel):
    path: str
    source_id: int
    add_value: int


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

    if body.path == _PLANNER_RECORDS_PATH:
        record = db.scalar(
            select(DailyPlanRecordDBM).where(
                DailyPlanRecordDBM.source_id == body.source_id,
                DailyPlanRecordDBM.user_id == user.id,
                DailyPlanRecordDBM.scheduled_date == date.today(),
            )
        )
        if record is None:
            raise HTTPException(status_code=404, detail="No plan record found for today with this source.")
        return planner_service.update_daily_record(
            db=db,
            current_user=user,
            record_id=record.id,
            status=None,
            actual_value=None,
            note=None,
            add_value=body.add_value,
        )

    raise HTTPException(status_code=400, detail=f"Unsupported path: {body.path}")
