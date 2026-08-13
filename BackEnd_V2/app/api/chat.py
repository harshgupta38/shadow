from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.core.endpoints import ENDPOINTS
from app.db.session import get_db
from app.models.user import User
from app.services import chat_service
from app.schemas.chat import ConversationData

router = APIRouter(prefix=ENDPOINTS.CHAT.PREFIX, tags=["Chat"])


@router.get(ENDPOINTS.CHAT.CONVERSATIONS, response_model=list[ConversationData])
def conversation_list(
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ConversationData]:
    return chat_service.conversation_list(db, current_user)
