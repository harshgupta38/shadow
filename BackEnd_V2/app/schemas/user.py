
from app.schemas.common import ORMModel


class UserData(ORMModel):
    id: int
    name: str
    email: str
    gender: str | None = None
    
    birth_day: str | None = None
    birth_month: str | None = None
    birth_year: str | None = None
    
    onboarding_completed: bool = False
