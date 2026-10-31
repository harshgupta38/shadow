"""Water intake. Each tap is an entry, so a mistaken one can be removed without losing the rest of the day."""

from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.common.timezone import today_ist
from app.core.exceptions import NotFoundError
from app.models.diet import DietProfileDBM, WaterLogDBM
from app.models.user import UserDBM
from app.schemas.diet import WaterAddRequest, WaterDayResponse, WaterEntryResponse, WaterHistoryPoint
from app.services import diet_diary_service

_MAX_HISTORY_DAYS = 90


def _target(db: Session, user: UserDBM) -> int | None:
    profile = db.get(DietProfileDBM, user.id)
    return profile.water_target_ml if profile else None


def get_day(db: Session, user: UserDBM, day: date | None = None) -> WaterDayResponse:
    target_day = day or today_ist()
    entries = db.scalars(
        select(WaterLogDBM).where(WaterLogDBM.user_id == user.id, WaterLogDBM.log_date == target_day).order_by(WaterLogDBM.id)
    ).all()
    return WaterDayResponse(
        date=target_day,
        total_ml=sum(e.amount_ml for e in entries),
        target_ml=_target(db, user),
        entries=[WaterEntryResponse.model_validate(e) for e in entries],
    )


def add(db: Session, user: UserDBM, request: WaterAddRequest) -> WaterDayResponse:
    day = diet_diary_service.resolve_date(request.log_date)
    db.add(WaterLogDBM(user_id=user.id, log_date=day, amount_ml=request.amount_ml))
    db.commit()
    return get_day(db, user, day)


def delete(db: Session, user: UserDBM, entry_id: int) -> WaterDayResponse:
    entry = db.scalar(select(WaterLogDBM).where(WaterLogDBM.id == entry_id, WaterLogDBM.user_id == user.id))
    if entry is None:
        raise NotFoundError("Water entry not found.")
    day = entry.log_date
    db.delete(entry)
    db.commit()
    return get_day(db, user, day)


def history(db: Session, user: UserDBM, days: int) -> list[WaterHistoryPoint]:
    """Totals for the last `days` days ending today. Days with no entries are listed as 0: nothing logged, not necessarily nothing drunk."""
    days = max(1, min(days, _MAX_HISTORY_DAYS))
    end = today_ist()
    start = end - timedelta(days=days - 1)
    totals = dict(
        db.execute(
            select(WaterLogDBM.log_date, func.sum(WaterLogDBM.amount_ml))
            .where(WaterLogDBM.user_id == user.id, WaterLogDBM.log_date >= start, WaterLogDBM.log_date <= end)
            .group_by(WaterLogDBM.log_date)
        ).all()
    )
    return [WaterHistoryPoint(date=start + timedelta(days=i), total_ml=int(totals.get(start + timedelta(days=i), 0))) for i in range(days)]
