import json
import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.memory import UserMemoryDBM
from app.schemas.memory import MemoryActionFromLLM

logger = logging.getLogger(__name__)

# Maximum number of memories retrieved per user per request.
# Keeps the injected prompt block bounded without vector search.
_MEMORY_RETRIEVAL_LIMIT = 20


def get_user_memories(db: Session, user_id: int) -> list[UserMemoryDBM]:
    return list(
        db.scalars(
            select(UserMemoryDBM)
            .where(UserMemoryDBM.user_id == user_id)
            .order_by(UserMemoryDBM.updated_at.desc())
            .limit(_MEMORY_RETRIEVAL_LIMIT)
        ).all()
    )


def apply_memory_actions(
    db: Session, user_id: int, actions: list[MemoryActionFromLLM]
) -> None:
    for action in actions:
        if action.action == "none":
            continue

        if action.action == "create":
            db.add(
                UserMemoryDBM(
                    user_id=user_id,
                    memory_type=action.memory_type,
                    topic=action.topic,
                    content=action.content,
                )
            )

        elif action.action == "update":
            if action.memory_id is None:
                logger.warning("Memory update action missing memory_id; skipping.")
                continue
            memory = db.get(UserMemoryDBM, action.memory_id)
            if memory is None or memory.user_id != user_id:
                logger.warning(
                    "Memory update target %s not found or belongs to wrong user; skipping.",
                    action.memory_id,
                )
                continue
            memory.memory_type = action.memory_type
            memory.topic = action.topic
            memory.content = action.content

        elif action.action == "retire":
            if action.memory_id is None:
                logger.warning("Memory retire action missing memory_id; skipping.")
                continue
            memory = db.get(UserMemoryDBM, action.memory_id)
            if memory is None or memory.user_id != user_id:
                logger.warning(
                    "Memory retire target %s not found or belongs to wrong user; skipping.",
                    action.memory_id,
                )
                continue
            db.delete(memory)

    db.commit()


def format_memories_for_prompt(memories: list[UserMemoryDBM]) -> str:
    if not memories:
        return ""
    lines = [
        f"[{m.memory_type} | {m.topic} (id:{m.id})]: {json.dumps(m.content, ensure_ascii=False)}"
        for m in memories
    ]
    return "User Memory (persisted from previous conversations):\n" + "\n".join(lines)


def serialize_memories_for_llm(memories: list[UserMemoryDBM]) -> list[dict]:
    return [
        {
            "id": m.id,
            "memory_type": m.memory_type,
            "topic": m.topic,
            "content": m.content,
        }
        for m in memories
    ]
