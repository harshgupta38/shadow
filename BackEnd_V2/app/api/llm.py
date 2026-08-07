from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.endpoints import ENDPOINTS
from app.llm.enums import ChatRole
from app.llm.exceptions import LLMError
from app.llm.models import ChatMessage, ChatRequest, ChatResponse
from app.llm.service import LLMService, get_llm_service

router = APIRouter(prefix=ENDPOINTS.LLM.PREFIX, tags=["LLM"])


@router.get(ENDPOINTS.LLM.TEST_CHAT, response_model=ChatResponse)
async def test_chat(
    prompt: str = Query(min_length=1),
    llm_service: LLMService = Depends(get_llm_service),
) -> ChatResponse:
    # here we are creating the chat message and sending it to agent
    request = ChatRequest(
        messages=[
            ChatMessage(
                role=ChatRole.USER,
                content=prompt,
            )
        ]
    )

    try:
        return await llm_service.chat(request)
    except LLMError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"LLM provider request failed: {exc}",
        ) from exc

# http://localhost:8000/api/llm/test-chat?prompt=Hello%20from%20test