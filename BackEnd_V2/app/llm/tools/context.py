from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models.user import UserDBM


@dataclass
class ToolContext:
    db: Session
    current_user: UserDBM
    action_data: dict | None = None
