from datetime import date

from pydantic import BaseModel, field_validator

from app.schemas.track_progress import ColorKey
from app.validators.bio import validate_bio


# A resolved, ready-to-render badge — the server decides which ones exist and
# whether each is unlocked (system-wide rules or per-habit/goal thresholds);
# the frontend only maps `icon` to a component and paints it. `icon` is a
# bootstrap-icons component name (e.g. "Fire", "TrophyFill").
class ProfileAchievement(BaseModel):
    key: str
    label: str
    hint: str
    icon: str
    unlocked: bool
    tone: ColorKey | None = None


# Single-endpoint contract for the Profile page — every card's data is a
# slice of this one response, no per-card requests (same approach as
# DashboardResponse). Name/email are deliberately excluded — they're sourced
# from AuthContext (UserDataResponse) on the frontend instead.
class ProfileResponse(BaseModel):
    bio: str | None
    joined_at: date
    email_verified: bool

    streak_days: int
    goals_completed: int
    habits_active: int
    tasks_completed_total: int

    month_alignment_percent: int
    month_goals_done: int
    month_goals_total: int
    month_habits_done: int
    month_habits_total: int
    month_tasks_done: int
    month_tasks_total: int

    achievements: list[ProfileAchievement]


class UpdateBioRequest(BaseModel):
    bio: str

    _validate_bio = field_validator("bio")(validate_bio)
