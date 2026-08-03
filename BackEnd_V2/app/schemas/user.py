
from app.schemas.common import ORMModel


class UserData(ORMModel):
    id: int
    name: str
    email: str
