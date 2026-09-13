
from app.schemas.common import ORMModel
from app.schemas.settings import AccessibilitySection, PlannerSection, ThemePreferenceValue


class UserDataDBS(ORMModel):
    id: int
    name: str
    email: str


class UserDataResponse(UserDataDBS):
    theme_preference: ThemePreferenceValue = "browser"
    planner: PlannerSection = PlannerSection()
    accessibility: AccessibilitySection = AccessibilitySection()