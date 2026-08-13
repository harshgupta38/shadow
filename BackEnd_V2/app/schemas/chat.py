from datetime import datetime

from app.schemas.common import ORMModel


class ConversationData(ORMModel):
    id: int
    user_id: int
    title: str
    agent_type: str

    stable_context: str
    context_summary: str
    linked_items: dict
    
    created_at: datetime
    updated_at: datetime
