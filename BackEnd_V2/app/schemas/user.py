
from app.schemas.common import ORMModel
from app.schemas.settings import ThemePreferenceValue


class UserDataDBS(ORMModel):
    id: int
    name: str
    email: str


class UserDataResponse(UserDataDBS):
    theme_preference: ThemePreferenceValue = "browser"