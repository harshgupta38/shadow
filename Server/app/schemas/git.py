from pydantic import BaseModel


class GitRequest(BaseModel):
    args: list[str]  # e.g. ["log", "--oneline", "-10"] or ["pull"]
