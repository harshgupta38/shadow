"""Water intake. One row per (user, day) stores the running total; add() accepts a delta (positive to add, negative to correct)."""

from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.common.timezone import today_ist
from app.models.diet import DietProfileDBM, WaterLogDBM
from app.models.user import UserDBM
from app.schemas.diet import WaterAddRequest, WaterDayResponse, WaterHistoryPoint
from app.services import diet_diary_service

_MAX_HISTORY_DAYS = 90


def _target(db: Session, user: UserDBM) -> int | None:
    profile = db.get(DietProfileDBM, user.id)
    return profile.water_target_ml if profile else None


def get_day(db: Session, user: UserDBM, day: date | None = None) -> WaterDayResponse:
    target_day = day or today_ist()
    row = db.scalar(select(WaterLogDBM).where(WaterLogDBM.user_id == user.id, WaterLogDBM.log_date == target_day))
    return WaterDayResponse(
        date=target_day,
        total_ml=row.amount_ml if row else 0,
        target_ml=_target(db, user),
    )


def add(db: Session, user: UserDBM, request: WaterAddRequest) -> WaterDayResponse:
    day = diet_diary_service.resolve_date(request.log_date)
    row = db.scalar(select(WaterLogDBM).where(WaterLogDBM.user_id == user.id, WaterLogDBM.log_date == day))
    if row is None:
        new_total = max(0, request.delta_ml)
        if new_total > 0:
            db.add(WaterLogDBM(user_id=user.id, log_date=day, amount_ml=new_total))
    else:
        row.amount_ml = max(0, row.amount_ml + request.delta_ml)
    db.commit()
    return get_day(db, user, day)


def history(db: Session, user: UserDBM, days: int) -> list[WaterHistoryPoint]:
    """Totals for the last `days` days ending today. Days with no entries are listed as 0: nothing logged, not necessarily nothing drunk."""
    days = max(1, min(days, _MAX_HISTORY_DAYS))
    end = today_ist()
    start = end - timedelta(days=days - 1)
    totals = dict(
        db.execute(
            select(WaterLogDBM.log_date, WaterLogDBM.amount_ml)
            .where(WaterLogDBM.user_id == user.id, WaterLogDBM.log_date >= start, WaterLogDBM.log_date <= end)
        ).all()
    )
    return [WaterHistoryPoint(date=start + timedelta(days=i), total_ml=int(totals.get(start + timedelta(days=i), 0))) for i in range(days)]
