from pydantic import BaseModel


class SqlRequest(BaseModel):
    query: str
