from typing import Literal

from pydantic import BaseModel, Field

MemoryType = Literal["preference", "progress", "decision", "constraint", "knowledge", "plan", "history"]
MemoryActionType = Literal["create", "update", "retire", "none"]


class MemoryActionFromLLM(BaseModel):
    action: MemoryActionType = Field(
        description=(
            "'create' a new memory, 'update' an existing one (requires memory_id), "
            "'retire' an outdated one (requires memory_id), or 'none' if no action is needed."
        )
    )
    memory_id: int | None = Field(
        default=None,
        description="ID of the existing memory to update or retire. Required for 'update' and 'retire'. Null for 'create'.",
    )
    memory_type: MemoryType = Field(
        description=(
            "Classification: 'preference' (likes/dislikes/styles), 'progress' (ongoing work/completions), "
            "'decision' (choices made), 'constraint' (limitations/requirements), "
            "'knowledge' (facts learned), 'plan' (intended future actions), 'history' (past events)."
        )
    )
    topic: str = Field(
        description="Short descriptive label for this memory (e.g. 'LeetCode Practice', 'Learning Style'). Max 60 chars."
    )
    content: dict = Field(
        description=(
            "Flexible JSON content. Structure is chosen by you based on what is useful. "
            "For 'update', include the complete merged content — not just the delta."
        )
    )
    reasoning: str = Field(
        description="One-sentence internal note explaining why this memory action is needed."
    )


class MemoryExtractionFromLLMSchema(BaseModel):
    actions: list[MemoryActionFromLLM] = Field(
        description=(
            "List of memory actions to apply. Return an empty list if nothing in this conversation "
            "is worth persisting to long-term memory."
        )
    )
