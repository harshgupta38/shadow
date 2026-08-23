
from app.schemas.common import ORMModel


class UserDataDBS(ORMModel):
    id: int
    name: str
    email: str


class UserDataResponse(UserDataDBS):
    pass