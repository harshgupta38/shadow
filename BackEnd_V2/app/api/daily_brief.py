from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.endpoints import ENDPOINTS
from app.db.session import get_db
from app.models.user import UserDBM
from app.schemas.daily_brief import DailyBriefResponse
from app.services.daily_brief_service import generate_brief_now, get_brief_for_date, get_or_generate_brief_audio

router = APIRouter(prefix=ENDPOINTS.DAILY_BRIEF.PREFIX, tags=["Daily Brief"])


def _parse_date(date: str) -> date_type:
    try:
        return date_type.fromisoformat(date)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid date format — expected YYYY-MM-DD.")


@router.get(ENDPOINTS.DAILY_BRIEF.DETAIL, response_model=DailyBriefResponse)
def get_daily_brief(
    date: str | None = Query(default=None, description="YYYY-MM-DD — defaults to today (IST)"),
    current_user: UserDBM = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.common import today_ist

    target = _parse_date(date) if date else today_ist()
    return get_brief_for_date(db, current_user.id, target)


@router.post(ENDPOINTS.DAILY_BRIEF.GENERATE, response_model=DailyBriefResponse)
async def generate_daily_brief_now(
    date: str = Query(description="YYYY-MM-DD — must be today (IST)"),
    current_user: UserDBM = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return await generate_brief_now(db, current_user, _parse_date(date))


@router.get(ENDPOINTS.DAILY_BRIEF.AUDIO)
async def get_daily_brief_audio(
    date: str = Query(description="YYYY-MM-DD"),
    current_user: UserDBM = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    audio_data = await get_or_generate_brief_audio(db, current_user.id, _parse_date(date))
    return Response(content=audio_data, media_type="audio/mpeg")
