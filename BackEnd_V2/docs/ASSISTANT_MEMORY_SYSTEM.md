# Assistant Memory System — Complete Technical Documentation

> **Branch:** `R202609/llm-memory`  
> **Date implemented:** September 2026  
> **Status:** Complete, 15/15 tests passing

---

## Table of Contents

1. [Why We Built This](#1-why-we-built-this)
2. [Core Design Principles](#2-core-design-principles)
3. [System Architecture Overview](#3-system-architecture-overview)
4. [Complete Data Flow](#4-complete-data-flow)
5. [Database Layer](#5-database-layer)
6. [Pydantic Schemas](#6-pydantic-schemas)
7. [Memory Service](#7-memory-service)
8. [LLM Layer Changes](#8-llm-layer-changes)
   - [8.1 LLM Models (To/From)](#81-llm-models-tofrom)
   - [8.2 Base Provider (Abstract Interface)](#82-base-provider-abstract-interface)
   - [8.3 LLM Service](#83-llm-service)
   - [8.4 System Prompt — Memory Extraction Instruction](#84-system-prompt--memory-extraction-instruction)
   - [8.5 Claude Provider — Implementation](#85-claude-provider--implementation)
   - [8.6 Other Providers — Stubs](#86-other-providers--stubs)
9. [Chat Service Integration](#9-chat-service-integration)
10. [App Startup — Table Registration](#10-app-startup--table-registration)
11. [How Memory is Injected into the System Prompt](#11-how-memory-is-injected-into-the-system-prompt)
12. [When Memory Extraction Is Triggered](#12-when-memory-extraction-is-triggered)
13. [Memory Lifecycle](#13-memory-lifecycle)
14. [Test Suite](#14-test-suite)
15. [Files Changed Summary](#15-files-changed-summary)
16. [Architectural Decisions and Limitations](#16-architectural-decisions-and-limitations)
17. [Example — End-to-End Scenario](#17-example--end-to-end-scenario)

---

## 1. Why We Built This

Before this feature, Shadow's assistant had no memory across conversations.

Each conversation had its own isolated context:
- `stable_context` — durable facts within a single conversation
- `context_summary` — a rolling summary of earlier messages within a single conversation
- `recent_messages` — the last N messages in the conversation window

**The problem:** When a user started a new conversation, the assistant started completely fresh. It had no idea what happened in previous conversations.

**Example scenario that exposed the gap:**

A user has a week-long conversation about LeetCode preparation. The assistant recommends problems, the user completes them, and progress is discussed across dozens of messages. When the context gets summarized and the older messages are pruned, early problem completions fall out of the window. When the user opens a new conversation days later, the assistant has no knowledge of which problems were already done, what topics were covered, or what the weak areas were.

The new memory system solves this by persisting durable, user-level information across any number of conversations.

---

## 2. Core Design Principles

### Principle 1: User-scoped, not conversation-scoped

Conversation memory (`stable_context`, `context_summary`) continues to work exactly as before — unchanged. The new memory lives at the **user** level and flows into every conversation.

### Principle 2: Domain-agnostic flexible JSON content

We do **not** define fixed database columns for LeetCode problems, career decisions, etc. The `content` field is a raw JSON dict. The LLM decides what structure to use inside it based on what is relevant for the topic.

This means a LeetCode memory could look like:
```json
{
  "completed_problems": ["Two Sum", "Valid Parentheses", "Binary Search"],
  "topics": ["arrays", "stacks", "binary search"],
  "weak_areas": ["binary search variants"]
}
```

While a career memory looks like:
```json
{
  "decided": "product management",
  "reasoning": "passion for users and cross-functional work",
  "target_timeline": "Q1 2027"
}
```

The database stores both without any schema changes.

### Principle 3: LLM decides what to remember

The backend defines the **structure and lifecycle** (create/update/retire/none). The LLM decides the **content** and **whether** to store anything at all. This keeps the system general-purpose.

### Principle 4: No new infrastructure

No vector database, no embeddings, no Redis, no RAG. V1 uses a simple SQL query and injects all memories as formatted text into the system prompt. This is appropriate for the current user scale and avoids complexity.

### Principle 5: Non-critical and fault-tolerant

Memory extraction is a background async task. If it fails (LLM error, parsing error, network issue), a warning is logged and the main conversation response is still returned successfully. The next threshold retry will pick it up.

---

## 3. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  User sends a message                                               │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  chat_service.respond_to_message()                                  │
│                                                                     │
│  1. Fetch recent messages from conversation                         │
│  2. memory_service.get_user_memories(user_id)           ◄──────── DB│
│  3. memory_service.format_memories_for_prompt(memories)             │
│  4. [if summary_update_due]:                                        │
│       asyncio.create_task(update_conversation_context)              │
│       asyncio.create_task(extract_user_memory)          ─────────► │
│  5. _call_llm_and_save(..., user_memory=formatted_str)              │
│       └─ llm_service.respond_to_message(user_memory=...)            │
│           └─ ClaudeProvider: injects user_memory into system prompt │
│  6. await context_task → save updated context to conversation       │
│  7. await memory_task → apply_memory_actions(actions) ──────────► DB│
└─────────────────────────────────────────────────────────────────────┘

Memory extraction call (background, concurrent):

┌─────────────────────────────────────────────────────────────────────┐
│  ClaudeProvider.extract_user_memory()                               │
│                                                                     │
│  INPUT (user prompt):                                               │
│    - Existing memories (JSON list with IDs)                         │
│    - Conversation: stable_context + context_summary + messages      │
│                                                                     │
│  SYSTEM: USER_MEMORY_EXTRACTION_SYSTEM_INSTRUCTION                  │
│                                                                     │
│  OUTPUT: MemoryExtractionFromLLMSchema                              │
│    { actions: [                                                     │
│        { action: "create"|"update"|"retire"|"none",                 │
│          memory_id: int|null,                                       │
│          memory_type: "progress"|"preference"|...,                  │
│          topic: "LeetCode Practice",                                │
│          content: { ... flexible JSON ... },                        │
│          reasoning: "..." }                                         │
│      ] }                                                            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Complete Data Flow

### First message in a new conversation

```
POST /chat
  body: { content: "...", agent_type: "shadow" }

  1. chat_service.create_conversation()
  2.   memory_service.get_user_memories(db, user_id)
  3.   memory_service.format_memories_for_prompt(memories)
  4.   llm_service.create_conversation(..., user_memory=formatted_str)
  5.     ClaudeProvider.create_conversation()
  6.       system = CREATE_CONVERSATION_SYSTEM_INSTRUCTION_CLAUDE[agent_type]
  7.       if user_memory: system += "\n\n" + user_memory
  8.       [tool loop if needed]
  9.       parse structured JSON → NewConvoFromLLMSchema
  10.   save ConversationDBM + MessageDBM (user + assistant)
  11.   return response
  
  NOTE: Memory extraction does NOT fire on the first message.
        Trigger fires at the message threshold (default: every 10 user messages).
```

### Subsequent message in an existing conversation

```
POST /chat/{conversation_id}/messages
  body: { content: "..." }

  1. chat_service.respond_to_message()
  2.   Load recent messages (last 12 by default)
  3.   Count stored user messages, compute summary_update_due
  4.   memory_service.get_user_memories(db, user_id)    → up to 20 rows
  5.   memory_service.format_memories_for_prompt(...)   → formatted string
  
  6.   [if summary_update_due]:
  6a.    asyncio.create_task(update_conversation_context)
  6b.    asyncio.create_task(extract_user_memory)
  
  7.   _call_llm_and_save(... user_memory=formatted_str)
  7a.    llm_service.respond_to_message(user_memory=formatted_str)
  7b.      MessageToLLM(... user_memory=formatted_str)
  7c.      ClaudeProvider.respond_to_message()
  7c1.       system = agent_instruction + conversation_context
  7c2.       if user_memory: system += "\n\n" + user_memory
  7c3.       [tool loop if needed]
  7c4.       parse MessageFromLLMSchema → content string
  7d.    save assistant MessageDBM
  
  8.   [if context_task]:
  8a.    await context_task → update conversation.context_summary / stable_context
  
  9.   [if memory_task]:
  9a.    await memory_task → memory_response.llm_data.actions
  9b.    memory_service.apply_memory_actions(db, user_id, actions)
         → create / update / retire rows in user_memories table
  
  10.  return message_response
```

### How a future conversation benefits

```
Next conversation, any topic:

  1. chat_service.respond_to_message()
  2.   memory_service.get_user_memories(user_id)
       → [UserMemoryDBM(id=3, type="progress", topic="LeetCode Practice",
                         content={"completed": [...], "weak_areas": [...]}),
          UserMemoryDBM(id=1, type="preference", topic="Learning Style",
                         content={"style": "visual"})]
  3.   format_memories_for_prompt(memories):
       →
       "User Memory (persisted from previous conversations):
        [progress | LeetCode Practice (id:3)]: {"completed": [...], "weak_areas": [...]}
        [preference | Learning Style (id:1)]: {"style": "visual"}"
  
  4.   Claude sees this in its system prompt and can immediately reference
       which problems the user already did, without the user repeating anything.
```

---

## 5. Database Layer

### New table: `user_memories`

**File:** `app/models/memory.py`

```python
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class UserMemoryDBM(Base):
    __tablename__ = "user_memories"
    __table_args__ = (
        CheckConstraint(
            "memory_type IN ('preference', 'progress', 'decision', 'constraint', 'knowledge', 'plan', 'history')",
            name="ck_user_memories_memory_type",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    memory_type: Mapped[str] = mapped_column(String(32), nullable=False)
    topic: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[dict] = mapped_column(JSON, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
```

### Column-by-column explanation

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | int | PK, auto-increment | Row identifier; sent to LLM so it can reference memories for update/retire |
| `user_id` | int | FK → users.id, CASCADE, indexed | Ownership and isolation. CASCADE means memories are automatically deleted if the user is deleted. Indexed for fast per-user lookups. |
| `memory_type` | VARCHAR(32) | CheckConstraint (7 values) | Generic classification of what kind of information this is. Constrained to prevent garbage values. |
| `topic` | VARCHAR(255) | NOT NULL | Short human-readable label the LLM assigns (e.g., "LeetCode Practice"). Used in the formatted prompt block and for visual identification. |
| `content` | JSON | NOT NULL | The actual memory information. Structure is entirely up to the LLM based on the topic domain. SQLite stores this as text; Python always sees it as a dict. |
| `created_at` | DateTime(tz) | server_default=now() | When the memory was first created. |
| `updated_at` | DateTime(tz) | server_default=now(), onupdate=now() | When the memory was last modified. Used to sort memories (most recently updated first). |

### Memory types

| Type | When to use |
|---|---|
| `preference` | User's likes, dislikes, communication style, learning preferences |
| `progress` | Ongoing work, completions, milestones reached in an area |
| `decision` | An important choice the user has made |
| `constraint` | Limitations, requirements, or restrictions that affect future planning |
| `knowledge` | Facts the user knows or has learned |
| `plan` | Intended future actions or strategies |
| `history` | Significant past events worth referencing |

### Relationship to existing tables

```
users
  └── user_memories (user_id FK, CASCADE)
  └── conversations (user_id FK)
        └── messages (conversation_id FK)
```

`user_memories` is completely independent from `conversations` and `messages`. There are no cross-table joins. The user_id is the only linking key.

### How the table is created at startup

`app/main.py` imports `UserMemoryDBM` so that SQLAlchemy's `Base.metadata.create_all(bind=engine)` at startup includes the `user_memories` table:

```python
# app/main.py (added line)
from app.models.memory import UserMemoryDBM
```

SQLite will create the table if it does not exist, with all constraints applied.

---

## 6. Pydantic Schemas

**File:** `app/schemas/memory.py`

```python
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
```

### Why these exact fields

**`action`** — one of four verbs. `none` is included explicitly so the LLM still returns a valid JSON structure even when there's nothing to store. This prevents the LLM from returning nothing or free text when there's no update needed.

**`memory_id`** — the database row ID. This is included in the prompt (via `serialize_memories_for_llm`) so the LLM can reference specific existing memories by their actual database ID. Without this, the LLM would have no way to target a specific memory for update or retire.

**`memory_type`** — restricted Literal type matching the database CheckConstraint. If the LLM returns an invalid type, Pydantic validation fails before it reaches the database, and the extraction is treated as a failure (logged, retried at next threshold).

**`topic`** — a human-readable label that also serves as the "header" in the formatted prompt block when memories are retrieved in future conversations.

**`content`** — `dict` intentionally. No further structure is enforced by the schema. The LLM's field descriptions explain the pattern (for `update`, include complete merged content, not just the delta).

**`reasoning`** — not stored in the database. It is in the schema purely to improve LLM output quality by forcing it to articulate why this memory matters before deciding to create/update it. This acts as a chain-of-thought nudge.

### How the schema drives the system prompt

`app/llm/common.py::build_schema_prompt()` inspects each field's type annotation and description to generate a JSON example with inline documentation. This example is appended to the memory extraction system instruction so the LLM knows the exact output format required.

---

## 7. Memory Service

**File:** `app/services/memory_service.py`

```python
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
```

### Function-by-function breakdown

#### `get_user_memories(db, user_id)`

Fetches up to 20 memories for the user, ordered by `updated_at DESC` (most recently updated first). This ordering is intentional — the most recently referenced or updated memories are likely the most relevant to the current moment, and they appear first in the prompt block where the LLM's attention is stronger.

The `_MEMORY_RETRIEVAL_LIMIT = 20` constant keeps the injected memory block bounded. Without a hard limit, a highly active user could accumulate many memories that would bloat every request's system prompt. 20 is generous enough for V1 and small enough to keep token costs manageable.

#### `apply_memory_actions(db, user_id, actions)`

Applies a list of memory actions returned by the LLM. Key security guarantee: **every `update` and `retire` action verifies `memory.user_id == user_id` before mutating**. This means even if the LLM somehow produces an action referencing another user's memory ID (e.g., ID 1 belonging to user A, but user B's extraction returns action for ID 1), the action is silently skipped and a warning is logged. There is no way for one user's memory extraction to modify another user's data.

A single `db.commit()` at the end applies all changes atomically.

#### `format_memories_for_prompt(memories)`

Converts memory rows into a compact text block for injection into the system prompt. The format is:

```
User Memory (persisted from previous conversations):
[progress | LeetCode Practice (id:3)]: {"completed_problems": ["Two Sum"], "topics": ["arrays"]}
[preference | Learning Style (id:1)]: {"style": "visual", "pace": "fast"}
```

The `(id:3)` part is critical — it's how the LLM knows which memory ID to reference when it wants to update or retire a specific memory in the extraction call. Without this, the LLM could not target specific rows.

Returns an empty string when there are no memories, so callers can safely check `if user_memory_str:` before appending to the system prompt.

#### `serialize_memories_for_llm(memories)`

Converts memory rows into a list of plain dicts for inclusion in the **memory extraction** call's user prompt. This is a different representation from `format_memories_for_prompt`:

- `format_memories_for_prompt` → injected into every chat response's system prompt (for context)
- `serialize_memories_for_llm` → sent to the memory extraction call (so LLM knows what already exists and can target specific IDs)

---

## 8. LLM Layer Changes

### 8.1 LLM Models (To/From)

**File:** `app/llm/models.py`

Three changes were made to this file:

#### Added import

```python
from app.schemas.memory import MemoryExtractionFromLLMSchema
```

#### Added `user_memory` field to `NewConvoToLLM`

```python
# --- CHAT - Start Conversation ---
class NewConvoToLLM(MetadataToLLM):
    request_data: NewConvoRequest
    user_memory: str = ""          # ← NEW: defaults to empty string
```

#### Added `user_memory` field to `MessageToLLM`

```python
# --- CHAT - Respond to Message ---
class MessageToLLM(MetadataToLLM):
    request_data: str
    agent_type: str
    stable_context: str
    context_summary: str
    recent_messages: list[dict[str, str]]
    # Formatted user memory block injected from previous conversations.
    # Empty string means no memory is available.
    user_memory: str = ""          # ← NEW
```

Both default to `""` so all existing callers that don't pass `user_memory` continue to work without changes. The provider checks `if request.user_memory:` before appending to the system prompt, so an empty string produces no change in behavior.

#### Added new To/From LLM models for memory extraction

```python
# --- USER MEMORY EXTRACTION ---
class ExtractUserMemoryToLLM(MetadataToLLM):
    agent_type: str
    stable_context: str
    context_summary: str
    messages: list[dict[str, str]]
    existing_memories: list[dict]


class ExtractUserMemoryFromLLM(MetadataFromLLM):
    llm_data: MemoryExtractionFromLLMSchema
```

`ExtractUserMemoryToLLM` extends `MetadataToLLM` (giving it `user_id`, `model`, `temperature`, `max_tokens`) and adds the fields specific to memory extraction:
- `agent_type` — included for context (which agent persona the conversation used)
- `stable_context` and `context_summary` — the conversation's current context state
- `messages` — the recent message window (same as what was passed to context update)
- `existing_memories` — the serialized memory rows from `serialize_memories_for_llm()`, sent so the LLM knows what already exists

`ExtractUserMemoryFromLLM` extends `MetadataFromLLM` (giving it `provider`, `model`, `usage`, `cost`, etc.) and wraps the parsed `MemoryExtractionFromLLMSchema`.

---

### 8.2 Base Provider (Abstract Interface)

**File:** `app/llm/base.py`

```python
from abc import ABC, abstractmethod

from app.llm.models import (
    RefineGoalToLLM,
    RefineGoalFromLLM,
    MilestoneProposalsToLLM,
    MilestoneProposalsFromLLM,
    TaskProposalsToLLM,
    TaskProposalsFromLLM,
    NewConvoToLLM,
    NewConvoFromLLM,
    MessageToLLM,
    MessageFromLLM,
    ConversationContextToLLM,
    ConversationContextFromLLM,
    ExtractUserMemoryToLLM,      # ← NEW
    ExtractUserMemoryFromLLM,    # ← NEW
)


class BaseLLMProvider(ABC):
    @abstractmethod
    async def refine_goal(self, request: RefineGoalToLLM) -> RefineGoalFromLLM:
        raise NotImplementedError

    @abstractmethod
    async def generate_milestone_proposals(self, request: MilestoneProposalsToLLM) -> MilestoneProposalsFromLLM:
        raise NotImplementedError

    @abstractmethod
    async def generate_task_proposals(self, request: TaskProposalsToLLM) -> TaskProposalsFromLLM:
        raise NotImplementedError

    @abstractmethod
    async def create_conversation(self, request: NewConvoToLLM) -> NewConvoFromLLM:
        raise NotImplementedError

    @abstractmethod
    async def respond_to_message(self, request: MessageToLLM) -> MessageFromLLM:
        raise NotImplementedError

    @abstractmethod
    async def update_conversation_context(self, request: ConversationContextToLLM) -> ConversationContextFromLLM:
        raise NotImplementedError

    @abstractmethod
    async def extract_user_memory(                     # ← NEW
        self, request: ExtractUserMemoryToLLM
    ) -> ExtractUserMemoryFromLLM:
        raise NotImplementedError

    @abstractmethod
    async def health_check(self) -> bool:
        raise NotImplementedError

    @abstractmethod
    async def close(self) -> None:
        return None
```

Adding `extract_user_memory` as an `@abstractmethod` enforces that every provider must implement it. Currently only `ClaudeProvider` has a real implementation; the others have `NotImplementedError` stubs.

---

### 8.3 LLM Service

**File:** `app/llm/service.py`

Two existing methods were updated to thread `user_memory` through, and one new method was added.

#### `create_conversation` — added `user_memory` parameter

```python
async def create_conversation(
    self,
    data: NewConvoRequest,
    user_id: int,
    goal_id: int | None = None,
    milestone_id: int | None = None,
    tool_executor: Callable[[str, dict], dict] | None = None,
    user_memory: str = "",           # ← NEW
) -> NewConvoFromLLM:
    request = NewConvoToLLM(
        request_data=data,
        user_id=user_id,
        goal_id=goal_id,
        milestone_id=milestone_id,
        tool_executor=tool_executor,
        user_memory=user_memory,     # ← NEW
    )
    response = await self._provider.create_conversation(request)

    if response is None or response.llm_data is None:
        raise LLMConfigurationError("LLM provider returned no conversation data.")

    return response
```

#### `respond_to_message` — added `user_memory` parameter

```python
async def respond_to_message(
    self,
    data: MessageRequest,
    stable_context: str,
    context_summary: str,
    agent_type: str,
    recent_messages: list[dict[str, str]],
    user_id: int,
    goal_id: int | None = None,
    milestone_id: int | None = None,
    tool_executor: Callable[[str, dict], dict] | None = None,
    user_memory: str = "",           # ← NEW
) -> MessageFromLLM:
    request = MessageToLLM(
        request_data=data.content,
        user_id=user_id,
        goal_id=goal_id,
        milestone_id=milestone_id,
        agent_type=agent_type,
        stable_context=stable_context,
        context_summary=context_summary,
        recent_messages=recent_messages,
        tool_executor=tool_executor,
        user_memory=user_memory,     # ← NEW
    )
    response = await self._provider.respond_to_message(request)

    if response is None or response.llm_data is None:
        raise LLMConfigurationError("LLM provider returned no message data.")

    return response
```

#### `extract_user_memory` — new method

```python
async def extract_user_memory(
    self,
    user_id: int,
    agent_type: str,
    stable_context: str,
    context_summary: str,
    messages: list[dict[str, str]],
    existing_memories: list[dict],
) -> ExtractUserMemoryFromLLM:
    request = ExtractUserMemoryToLLM(
        user_id=user_id,
        agent_type=agent_type,
        stable_context=stable_context,
        context_summary=context_summary,
        messages=messages,
        existing_memories=existing_memories,
    )
    response = await self._provider.extract_user_memory(request)

    if response is None or response.llm_data is None:
        raise LLMConfigurationError("LLM provider returned no memory extraction data.")

    return response
```

The `LLMService` singleton (cached via `@lru_cache(maxsize=1)`) routes all calls through `self._provider`, so the active provider (configured via `LLM_PROVIDER` env var) handles the actual work.

---

### 8.4 System Prompt — Memory Extraction Instruction

**File:** `app/llm/knowledge_base.py`

The memory extraction system prompt is assembled from two parts:

```python
_MEMORY_EXTRACTION_INSTRUCTION = (
    "You are a memory manager for Shadow, an AI personal assistant. "
    "Your job is to analyze a conversation and decide what information should be "
    "persisted as long-term user memory for use in future conversations.\n\n"

    "You will receive:\n"
    "- The conversation's stable context and summary.\n"
    "- Recent messages from the conversation.\n"
    "- A list of existing user memories (with their IDs).\n\n"

    "Decide what actions to take — create, update, retire, or none:\n\n"

    "CREATE a new memory when:\n"
    "- The conversation contains durable, useful information not covered by any existing memory.\n"
    "- The information will help future assistants make better recommendations or responses.\n\n"

    "UPDATE an existing memory when:\n"
    "- New information extends or refines an existing memory on the same topic.\n"
    "- Always provide the COMPLETE merged content — not just the delta.\n\n"

    "RETIRE an existing memory when:\n"
    "- It contains information that is now outdated, superseded, or contradicted.\n\n"

    "Return NONE (empty actions list) when:\n"
    "- The conversation contains only temporary details, one-off questions, or trivial exchanges.\n"
    "- The information is already available from Shadow's normal database (goals, tasks, habits, etc.).\n"
    "- Nothing would meaningfully help a future assistant.\n\n"

    "Examples worth remembering:\n"
    "- User completed a set of problems/exercises and their progress.\n"
    "- Long-term preferences (communication style, learning approach, tools preferred).\n"
    "- Important decisions made or constraints that affect future plans.\n"
    "- Ongoing progress in an area that spans multiple conversations.\n\n"

    "Examples NOT worth remembering:\n"
    "- Greetings and casual small talk.\n"
    "- One-off factual questions with no future relevance.\n"
    "- Information that will be fetched fresh from the database each time (goal titles, task statuses).\n\n"

    "Be selective. Fewer high-quality memories are better than many low-value ones.\n\n"
    "Return only the JSON object matching the required schema."
)

USER_MEMORY_EXTRACTION_SYSTEM_INSTRUCTION = (
    _MEMORY_EXTRACTION_INSTRUCTION
    + "\n\nSchema:\n"
    + build_schema_prompt(MemoryExtractionFromLLMSchema)
)
```

`build_schema_prompt(MemoryExtractionFromLLMSchema)` generates a JSON example with field descriptions, auto-derived from the Pydantic model — consistent with how all other LLM output schemas work in this project.

The user prompt (assembled in `ClaudeProvider.extract_user_memory`) is:

```
Existing user memories:
[
  {
    "id": 3,
    "memory_type": "progress",
    "topic": "LeetCode Practice",
    "content": {"completed_problems": ["Two Sum"], "topics": ["arrays"]}
  }
]

Conversation to analyze:
Stable context:
User is preparing for FAANG interviews by systematically practicing LeetCode.

Conversation summary:
User discussed array problems. Completed Two Sum. Asked about next steps.

Recent messages:
[user]: I just finished Binary Search and Find Minimum in Rotated Array today.
[assistant]: Great progress! Both are important for the binary search pattern...
[user]: I still struggle with the boundary conditions though.
```

---

### 8.5 Claude Provider — Implementation

**File:** `app/llm/providers/claude.py`

#### New parser method

```python
def _parse_MemoryExtractionFromLLMSchema(self, response) -> MemoryExtractionFromLLMSchema:
    try:
        raw = self._strip_code_fence(self._extract_text_content(response))
        return MemoryExtractionFromLLMSchema.model_validate_json(raw)
    except ValidationError as exc:
        raise LLMRequestError(
            "Claude returned a response that does not match MemoryExtractionFromLLMSchema."
        ) from exc
```

Follows the exact same pattern as every other schema parser in the provider:
1. Extract text content from the Claude response object
2. Strip any code fences Claude might have added despite being instructed not to
3. Parse and validate with Pydantic
4. Wrap any validation failure in `LLMRequestError`

#### New `extract_user_memory` method

```python
async def extract_user_memory(
    self, request: ExtractUserMemoryToLLM
) -> ExtractUserMemoryFromLLM:
    model = self._resolve_model(request)

    existing_block = (
        json.dumps(request.existing_memories, ensure_ascii=False, indent=2)
        if request.existing_memories
        else "[]"
    )
    conversation_block = (
        f"Stable context:\n{request.stable_context}\n\n"
        f"Conversation summary:\n{request.context_summary}\n\n"
        f"Recent messages:\n"
        + "\n".join(
            f"[{m['role']}]: {m['content']}"
            for m in request.messages
        )
    )
    user_prompt = (
        f"Existing user memories:\n{existing_block}\n\n"
        f"Conversation to analyze:\n{conversation_block}"
    )

    started_at = perf_counter()
    try:
        kwargs: dict = {
            "model": model,
            "system": USER_MEMORY_EXTRACTION_SYSTEM_INSTRUCTION,
            "messages": [{"role": "user", "content": user_prompt}],
            "max_tokens": request.max_tokens or 2048,
        }
        if request.temperature is not None:
            kwargs["temperature"] = request.temperature
        completion = await self._client.messages.create(**kwargs)
    except (APIConnectionError, APIStatusError, APIError) as exc:
        raise LLMProviderError(f"Claude extract_user_memory failed: {exc}") from exc

    response_time_ms = int((perf_counter() - started_at) * 1000)

    await log_claude_completion_usage_async(
        settings=self._settings,
        model=model,
        completion=completion,
        latency_ms=response_time_ms,
        user_id=request.user_id,
        operation="extract_user_memory",
    )

    parsed = self._parse_MemoryExtractionFromLLMSchema(completion)

    usage = None
    if completion.usage is not None:
        input_tokens = completion.usage.input_tokens
        output_tokens = completion.usage.output_tokens
        usage = TokenUsage(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=input_tokens + output_tokens,
        )

    return ExtractUserMemoryFromLLM(
        provider=LLMProvider.CLAUDE,
        model=model,
        model_str=completion.model or model,
        llm_data=parsed,
        finish_reason=completion.stop_reason or "unknown",
        usage=usage,
        response_id=completion.id,
        response_time_ms=response_time_ms,
        cost=calculate_token_cost(
            model_key=model,
            input_tokens=usage.input_tokens if usage and usage.input_tokens else 0,
            output_tokens=usage.output_tokens if usage and usage.output_tokens else 0,
        ),
    )
```

Key design notes:
- **No tool loop.** Memory extraction is a simple single-shot call. No tools are attached — the LLM only needs to read the provided context and return JSON.
- **No `_tool_complete`.** Uses `self._client.messages.create()` directly (same as `refine_goal` and `update_conversation_context`).
- **Usage is logged** via `log_claude_completion_usage_async` with `operation="extract_user_memory"` so it appears in the usage analytics dashboard.
- **Cost is calculated** and returned in the response object for tracking.

#### Updated `create_conversation` — user memory injection

```python
async def create_conversation(self, request: NewConvoToLLM) -> NewConvoFromLLM:
    model = self._resolve_model(request)

    request_data = request.request_data
    system = CREATE_CONVERSATION_SYSTEM_INSTRUCTION_CLAUDE[request_data.agent_type]
    if request.user_memory:                         # ← NEW
        system += f"\n\n{request.user_memory}"      # ← NEW
    messages = [{"role": Role.USER, "content": request_data.content}]

    # ... rest unchanged ...
```

#### Updated `respond_to_message` — user memory injection

```python
async def respond_to_message(self, request: MessageToLLM) -> MessageFromLLM:
    model = self._resolve_model(request)

    conversation_context = (
        f"Stable context:\n{request.stable_context}\n\n"
        f"Conversation summary:\n{request.context_summary}"
    )
    system = (
        RESPOND_TO_MESSAGE_SYSTEM_INSTRUCTION_CLAUDE[request.agent_type]
        + f"\n\nConversation context:\n{conversation_context}"
    )
    if request.user_memory:                         # ← NEW
        system += f"\n\n{request.user_memory}"      # ← NEW
    messages = [
        *request.recent_messages,
        {"role": Role.USER, "content": request.request_data},
    ]

    # ... rest unchanged ...
```

The memory block appears **after** the conversation context in the system prompt. This order is intentional: the conversation's own `stable_context` and `context_summary` are more directly relevant to the immediate exchange, while user memory provides broader background. The LLM's attention naturally decreases toward the end of a long system prompt, so conversation-specific context takes priority.

---

### 8.6 Other Providers — Stubs

All three other providers (`OpenAIProvider`, `GeminiProvider`, `OllamaProvider`) received a minimal stub to satisfy the abstract base class:

```python
# app/llm/providers/openai.py
async def extract_user_memory(self, request):
    raise NotImplementedError("extract_user_memory is not yet implemented for OpenAI provider.")

# app/llm/providers/gemini.py
async def extract_user_memory(self, request):
    raise NotImplementedError("extract_user_memory is not yet implemented for Gemini provider.")

# app/llm/providers/ollama.py
async def extract_user_memory(self, request):
    raise NotImplementedError("extract_user_memory is not yet implemented for Ollama provider.")
```

If any of these providers become active in production, the corresponding implementation must be written before memory extraction will work for users on those providers. The error is explicit and descriptive so the failure is obvious during development.

---

## 9. Chat Service Integration

**File:** `app/services/chat_service.py`

### Import added

```python
from app.services import memory_service
```

### `create_conversation` — updated

The relevant new section:

```python
async def create_conversation(
    db: Session,
    current_user: UserDBM,
    data: NewConvoRequest,
) -> NewConvoResponse:
    llm_service = get_llm_service()

    # NEW: load and format user memories before the LLM call
    user_memories = memory_service.get_user_memories(db, current_user.id)
    user_memory_str = memory_service.format_memories_for_prompt(user_memories)

    tool_context = ToolContext(db=db, current_user=current_user)
    tool_executor = partial(execute_tool, context=tool_context)

    try:
        response = await llm_service.create_conversation(
            data,
            user_id=current_user.id,
            goal_id=data.goal_id,
            milestone_id=data.milestone_id,
            tool_executor=tool_executor,
            user_memory=user_memory_str,   # ← NEW
        )
    except LLMError as exc:
        # ... unchanged ...
```

Note: Memory extraction does **not** fire when creating a new conversation. The threshold mechanism only exists in `respond_to_message`. This is intentional — the first message of a conversation is not enough context to evaluate what is worth persisting.

### `_call_llm_and_save` — updated signature

```python
async def _call_llm_and_save(
    db: Session,
    current_user: UserDBM,
    conversation: ConversationDBM,
    user_message: MessageDBM,
    data: MessageRequest,
    recent_message_data: list[dict],
    user_memory: str = "",             # ← NEW
) -> MessageResponse:
    user_message.request_status = "pending"
    db.commit()

    tool_context = ToolContext(db=db, current_user=current_user)
    tool_executor = partial(execute_tool, context=tool_context)

    llm_service = get_llm_service()
    try:
        response = await llm_service.respond_to_message(
            data,
            user_id=current_user.id,
            goal_id=data.goal_id,
            milestone_id=data.milestone_id,
            agent_type=conversation.agent_type,
            stable_context=conversation.stable_context,
            context_summary=conversation.context_summary,
            recent_messages=recent_message_data,
            tool_executor=tool_executor,
            user_memory=user_memory,   # ← NEW
        )
    except LLMError as exc:
        # ... unchanged ...
```

### `respond_to_message` — full updated function

```python
async def respond_to_message(
    db: Session,
    current_user: UserDBM,
    conversation_id: int,
    data: MessageRequest,
) -> MessageResponse:
    conversation = db.get(ConversationDBM, conversation_id)

    if not conversation or conversation.user_id != current_user.id:
        raise NotFoundError("Conversation not found or access denied.")

    recent_messages = list(
        db.scalars(
            select(MessageDBM)
            .where(MessageDBM.conversation_id == conversation.id)
            .order_by(MessageDBM.id.desc())
            .limit(llm_settings.chat_recent_message_limit)
        ).all()
    )
    recent_messages.reverse()

    stored_user_message_count = db.scalar(
        select(func.count())
        .select_from(MessageDBM)
        .where(
            MessageDBM.conversation_id == conversation.id,
            MessageDBM.role == MessageRoleEnum.USER,
        )
    ) or 0
    total_user_message_count = stored_user_message_count + 1
    new_user_message_count = (
        total_user_message_count - conversation.summary_user_message_count
    )
    summary_update_due = (
        new_user_message_count >= llm_settings.chat_summary_update_user_messages
    )

    recent_message_data = [
        {"role": message.role, "content": message.content[-1]}
        for message in recent_messages
    ]
    context_messages = [
        *recent_message_data,
        {"role": MessageRoleEnum.USER, "content": data.content},
    ]

    # NEW: Load and format user memories for injection into the LLM prompt.
    user_memories = memory_service.get_user_memories(db, current_user.id)
    user_memory_str = memory_service.format_memories_for_prompt(user_memories)

    llm_service = get_llm_service()
    context_task = None
    memory_task = None                               # ← NEW
    if summary_update_due:
        # Fire context summary update and user memory extraction concurrently
        # with the main LLM call. Both are non-critical: if either fails, the
        # next threshold retries. Total latency = max(bg_time, message_time).
        context_task = asyncio.create_task(
            llm_service.update_conversation_context(
                user_id=current_user.id,
                agent_type=conversation.agent_type,
                stable_context=conversation.stable_context,
                context_summary=conversation.context_summary,
                messages=context_messages,
            )
        )
        memory_task = asyncio.create_task(          # ← NEW
            llm_service.extract_user_memory(
                user_id=current_user.id,
                agent_type=conversation.agent_type,
                stable_context=conversation.stable_context,
                context_summary=conversation.context_summary,
                messages=context_messages,
                existing_memories=memory_service.serialize_memories_for_llm(user_memories),
            )
        )

    user_message = MessageDBM(
        conversation_id=conversation.id,
        role=MessageRoleEnum.USER,
        content=[data.content],
        request_status="pending",
    )
    db.add(user_message)

    try:
        message_response = await _call_llm_and_save(
            db, current_user, conversation, user_message, data,
            recent_message_data, user_memory=user_memory_str,  # ← NEW
        )
    except Exception:
        # Cancel background tasks on main-call failure to avoid orphaned warnings.
        for task in (context_task, memory_task):              # ← NEW includes memory_task
            if task is not None:
                task.cancel()
                try:
                    await task
                except (asyncio.CancelledError, Exception):
                    pass
        raise

    if context_task is not None:
        try:
            context_response = await context_task
            context_data = context_response.llm_data
            if context_data.context_summary.strip():
                conversation.context_summary = context_data.context_summary
                if context_data.stable_context and context_data.stable_context.strip():
                    conversation.stable_context = context_data.stable_context
                conversation.summary_user_message_count = total_user_message_count
                db.commit()
        except Exception:
            logger.exception("Context summary update failed; will retry at next threshold.")

    # NEW: apply memory actions from the extraction task
    if memory_task is not None:
        try:
            memory_response = await memory_task
            actions = memory_response.llm_data.actions
            if actions:
                memory_service.apply_memory_actions(db, current_user.id, actions)
        except Exception:
            logger.exception("User memory extraction failed; will retry at next threshold.")

    return message_response
```

### `regenerate_response` — updated

```python
# After identifying the paired user message and building prior messages...

user_memories = memory_service.get_user_memories(db, current_user.id)    # ← NEW
user_memory_str = memory_service.format_memories_for_prompt(user_memories) # ← NEW

# ...

response = await llm_service.respond_to_message(
    data,
    user_id=current_user.id,
    agent_type=conversation.agent_type,
    stable_context=conversation.stable_context,
    context_summary=conversation.context_summary,
    recent_messages=recent_message_data,
    tool_executor=tool_executor,
    user_memory=user_memory_str,                                           # ← NEW
)
```

Memory extraction does **not** fire during regeneration. Regeneration re-runs the LLM for the same message — it's not a new exchange and would produce duplicate memory evaluations.

---

## 10. App Startup — Table Registration

**File:** `app/main.py`

```python
from app.models.memory import UserMemoryDBM    # ← NEW (added alongside existing model imports)
```

This single import ensures SQLAlchemy's registry knows about `UserMemoryDBM` when `Base.metadata.create_all(bind=engine)` runs at startup. The table is created automatically if it doesn't exist. No migration file is needed for SQLite (which the project uses in development/production on Termux).

---

## 11. How Memory is Injected into the System Prompt

The final system prompt for a typical `respond_to_message` call with memories looks like this:

```
You are Shadow, a personal AI life coach. You help users reflect, plan, and take action
across all areas of their life. Be conservative with tools — most conversations don't need
application data.

You are continuing an existing conversation. Use the stable context, conversation
summary, and recent messages to respond directly to the user's latest message without
restarting the conversation or re-asking for information you already have.

[_CONTEXT_USAGE fragment]
[_TOOL_POLICY fragment]
[_RESPONSE_STYLE fragment]

Return only the final user-facing response text.

The response MUST be a JSON object that exactly matches the schema.
[... JSON schema for MessageFromLLMSchema ...]

Conversation context:
Stable context:
User is preparing for FAANG interviews via LeetCode.

Conversation summary:
User completed Two Sum. Discussed arrays and hash maps. User wants to move to binary search.

User Memory (persisted from previous conversations):
[progress | LeetCode Practice (id:3)]: {"completed_problems": ["Two Sum", "Valid Parentheses"], "topics": ["arrays", "stacks"], "weak_areas": []}
[preference | Learning Style (id:1)]: {"style": "visual", "pace": "one topic per session"}
```

The memory block is appended at the end of the system prompt, after `Conversation context:`. The LLM reads all of this as unified context before generating its response.

---

## 12. When Memory Extraction Is Triggered

Memory extraction is tied to the existing `summary_update_due` threshold:

```python
# In respond_to_message:
stored_user_message_count = db.scalar(...)  # count of user messages already stored
total_user_message_count = stored_user_message_count + 1
new_user_message_count = total_user_message_count - conversation.summary_user_message_count
summary_update_due = (
    new_user_message_count >= llm_settings.chat_summary_update_user_messages
)
```

`chat_summary_update_user_messages` defaults to `10` (configurable via `CHAT_SUMMARY_UPDATE_USER_MESSAGES` env var).

When `summary_update_due` is `True`:
1. `update_conversation_context` fires (existing behavior)
2. `extract_user_memory` fires (new behavior)

Both fire as `asyncio.create_task()` — parallel background coroutines that run alongside the main LLM call. The total added latency is `max(memory_extraction_time, context_update_time, main_call_time)` — typically zero added latency because the main conversation response takes as long or longer.

### Why piggyback on the same threshold?

- **Context is already evaluated** — at the threshold, `update_conversation_context` already processes the full message window. Sending the same window to memory extraction at the same moment is efficient and provides consistent context.
- **Already proven pattern** — the threshold mechanism is battle-tested for context updates. Reusing it avoids adding another counter or trigger mechanism.
- **Avoids over-extraction** — a memory extraction LLM call for every single message would be expensive. Every 10 messages is a sensible tradeoff.

### Limitation: first-message information may take up to 10 messages to be extracted

If a user mentions something important in message 1 of a conversation and never repeats it, memory extraction won't run until message 10 (first threshold). The system design accepts this tradeoff in V1. The context summary will still capture it within the conversation. For V2, an explicit "remember this" user command could trigger an immediate extraction.

---

## 13. Memory Lifecycle

### Creating a memory

The LLM returns:
```json
{
  "actions": [
    {
      "action": "create",
      "memory_id": null,
      "memory_type": "progress",
      "topic": "LeetCode Practice",
      "content": {
        "completed_problems": ["Two Sum", "Valid Parentheses"],
        "topics_covered": ["arrays", "hash maps"],
        "weak_areas": []
      },
      "reasoning": "User completed two problems and established a study topic."
    }
  ]
}
```

`apply_memory_actions` adds a new `UserMemoryDBM` row to the database.

### Updating a memory

At the next threshold, the existing memory (now with its ID exposed in the prompt and in `existing_memories`) is referenced:

```json
{
  "actions": [
    {
      "action": "update",
      "memory_id": 3,
      "memory_type": "progress",
      "topic": "LeetCode Practice",
      "content": {
        "completed_problems": ["Two Sum", "Valid Parentheses", "Binary Search", "Find Minimum in Rotated Array"],
        "topics_covered": ["arrays", "hash maps", "binary search"],
        "weak_areas": ["binary search boundary conditions"]
      },
      "reasoning": "User completed 2 more problems and identified a weak area."
    }
  ]
}
```

`apply_memory_actions` fetches the row by `memory_id`, verifies `user_id` matches, then overwrites `memory_type`, `topic`, and `content`. The `updated_at` timestamp updates automatically via `onupdate=func.now()`.

**Important:** The LLM is instructed to provide the **complete merged content** on update, not just the delta. This simplifies the backend — it doesn't need to merge JSON, it just replaces the content field.

### Retiring a memory

When information is outdated or contradicted:

```json
{
  "actions": [
    {
      "action": "retire",
      "memory_id": 5,
      "memory_type": "plan",
      "topic": "Job Search Strategy",
      "content": {},
      "reasoning": "User decided to delay job search for 6 months — old plan is irrelevant."
    }
  ]
}
```

`apply_memory_actions` deletes the row permanently. No soft-delete in V1.

### Doing nothing

```json
{
  "actions": []
}
```

`apply_memory_actions` receives an empty list. Nothing happens. The function returns immediately after the (empty) loop.

---

## 14. Test Suite

**File:** `tests/test_memory.py`

Tests run against an in-memory SQLite database (fresh per test function). No mocking of the database — all tests use real SQLAlchemy ORM operations.

```python
"""
Tests for the persistent user memory system.

Covers:
1. Conversation contains nothing worth remembering → no memory created.
2. Conversation contains useful persistent information → memory created.
3. New conversation on the same topic → relevant previous memory is available.
4. New information relates to an existing memory → existing memory is updated instead of duplicated.
5. Different users cannot access each other's memories.
6. Flexible JSON memory content works with different domains.
7. retire action removes outdated memories.
8. apply_memory_actions security: cannot mutate another user's memory.
9. format_memories_for_prompt produces expected output.
10. serialize_memories_for_llm produces LLM-ready dicts.
"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from app.models.base import Base
from app.models.user import UserDBM
from app.models.memory import UserMemoryDBM
from app.schemas.memory import MemoryActionFromLLM, MemoryExtractionFromLLMSchema
from app.services import memory_service


# ---------------------------------------------------------------------------
# Test fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="function")
def db() -> Session:
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    session = SessionLocal()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)


def _make_user(db: Session, email: str, name: str = "Test User") -> UserDBM:
    user = UserDBM(name=name, email=email, hashed_password="hashed")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _make_memory(
    db: Session,
    user_id: int,
    memory_type: str = "progress",
    topic: str = "Test Topic",
    content: dict | None = None,
) -> UserMemoryDBM:
    memory = UserMemoryDBM(
        user_id=user_id,
        memory_type=memory_type,
        topic=topic,
        content=content or {"key": "value"},
    )
    db.add(memory)
    db.commit()
    db.refresh(memory)
    return memory


# ---------------------------------------------------------------------------
# 1. No actions → no memory created
# ---------------------------------------------------------------------------

def test_empty_actions_creates_no_memory(db):
    user = _make_user(db, "user1@test.com")
    memory_service.apply_memory_actions(db, user.id, [])
    memories = memory_service.get_user_memories(db, user.id)
    assert memories == []


def test_none_action_creates_no_memory(db):
    user = _make_user(db, "user1@test.com")
    actions = [
        MemoryActionFromLLM(
            action="none",
            memory_id=None,
            memory_type="progress",
            topic="Irrelevant",
            content={},
            reasoning="Nothing worth saving.",
        )
    ]
    memory_service.apply_memory_actions(db, user.id, actions)
    memories = memory_service.get_user_memories(db, user.id)
    assert memories == []


# ---------------------------------------------------------------------------
# 2. Useful information → memory created
# ---------------------------------------------------------------------------

def test_create_action_persists_memory(db):
    user = _make_user(db, "user1@test.com")
    actions = [
        MemoryActionFromLLM(
            action="create",
            memory_id=None,
            memory_type="progress",
            topic="LeetCode Practice",
            content={"completed_problems": ["Two Sum", "Valid Parentheses"], "topics": ["arrays"]},
            reasoning="User completed problems in this conversation.",
        )
    ]
    memory_service.apply_memory_actions(db, user.id, actions)
    memories = memory_service.get_user_memories(db, user.id)

    assert len(memories) == 1
    assert memories[0].topic == "LeetCode Practice"
    assert memories[0].memory_type == "progress"
    assert memories[0].content["completed_problems"] == ["Two Sum", "Valid Parentheses"]
    assert memories[0].user_id == user.id


# ---------------------------------------------------------------------------
# 3. Previous memory is available in next conversation
# ---------------------------------------------------------------------------

def test_previous_memory_available_in_next_conversation(db):
    user = _make_user(db, "user1@test.com")
    _make_memory(
        db, user.id, "progress", "LeetCode Practice",
        {"completed_problems": ["Two Sum"], "topics": ["arrays"]},
    )

    memories = memory_service.get_user_memories(db, user.id)
    assert len(memories) == 1

    prompt_str = memory_service.format_memories_for_prompt(memories)
    assert "LeetCode Practice" in prompt_str
    assert "Two Sum" in prompt_str


# ---------------------------------------------------------------------------
# 4. Update merges into existing memory instead of creating duplicate
# ---------------------------------------------------------------------------

def test_update_action_merges_into_existing_memory(db):
    user = _make_user(db, "user1@test.com")
    existing = _make_memory(
        db, user.id, "progress", "LeetCode Practice",
        {"completed_problems": ["Two Sum"], "topics": ["arrays"]},
    )

    actions = [
        MemoryActionFromLLM(
            action="update",
            memory_id=existing.id,
            memory_type="progress",
            topic="LeetCode Practice",
            content={
                "completed_problems": ["Two Sum", "Binary Search", "Find Minimum in Rotated Array"],
                "topics": ["arrays", "binary search"],
                "weak_areas": ["binary search variants"],
            },
            reasoning="User completed 2 more problems.",
        )
    ]
    memory_service.apply_memory_actions(db, user.id, actions)

    memories = memory_service.get_user_memories(db, user.id)
    assert len(memories) == 1  # no duplicate created
    assert len(memories[0].content["completed_problems"]) == 3
    assert "weak_areas" in memories[0].content


# ---------------------------------------------------------------------------
# 5. Users cannot access each other's memories
# ---------------------------------------------------------------------------

def test_user_isolation(db):
    user_a = _make_user(db, "a@test.com")
    user_b = _make_user(db, "b@test.com")

    _make_memory(db, user_a.id, "preference", "Learning Style", {"style": "visual"})
    _make_memory(db, user_b.id, "knowledge", "Career Goals", {"goal": "become a PM"})

    memories_a = memory_service.get_user_memories(db, user_a.id)
    memories_b = memory_service.get_user_memories(db, user_b.id)

    assert len(memories_a) == 1
    assert memories_a[0].topic == "Learning Style"

    assert len(memories_b) == 1
    assert memories_b[0].topic == "Career Goals"


def test_update_cannot_mutate_other_users_memory(db):
    user_a = _make_user(db, "a@test.com")
    user_b = _make_user(db, "b@test.com")

    memory_a = _make_memory(db, user_a.id, "preference", "Secret Preference", {"secret": True})

    # user_b tries to update user_a's memory
    actions = [
        MemoryActionFromLLM(
            action="update",
            memory_id=memory_a.id,
            memory_type="preference",
            topic="Hijacked",
            content={"hijacked": True},
            reasoning="Attempting cross-user mutation.",
        )
    ]
    memory_service.apply_memory_actions(db, user_b.id, actions)

    # user_a's memory must be unchanged
    db.expire(memory_a)
    refreshed = db.get(UserMemoryDBM, memory_a.id)
    assert refreshed.topic == "Secret Preference"
    assert refreshed.content == {"secret": True}


def test_retire_cannot_delete_other_users_memory(db):
    user_a = _make_user(db, "a@test.com")
    user_b = _make_user(db, "b@test.com")

    memory_a = _make_memory(db, user_a.id, "knowledge", "Private Knowledge", {"data": "mine"})

    actions = [
        MemoryActionFromLLM(
            action="retire",
            memory_id=memory_a.id,
            memory_type="knowledge",
            topic="Private Knowledge",
            content={},
            reasoning="Attempting cross-user deletion.",
        )
    ]
    memory_service.apply_memory_actions(db, user_b.id, actions)

    still_there = db.get(UserMemoryDBM, memory_a.id)
    assert still_there is not None


# ---------------------------------------------------------------------------
# 6. Flexible JSON content works for different domains
# ---------------------------------------------------------------------------

def test_flexible_content_different_domains(db):
    user = _make_user(db, "user@test.com")

    domains = [
        ("progress", "LeetCode Practice", {"completed": ["Two Sum"], "topics": ["arrays"], "weak_areas": []}),
        ("preference", "Learning Style", {"style": "visual", "pace": "fast", "prefer_examples": True}),
        ("decision", "Career Path", {"decided": "product management", "reasoning": "passion for users"}),
        ("constraint", "Schedule", {"available_hours_per_week": 10, "no_weekends": True}),
        ("knowledge", "Python Facts", {"known_topics": ["asyncio", "SQLAlchemy"], "level": "intermediate"}),
        ("plan", "Next Steps", {"actions": ["finish LeetCode 75", "apply to PM roles"], "timeline": "3 months"}),
        ("history", "Conversation Summary", {"topics_discussed": ["goal setting", "career"], "date": "2026-09"}),
    ]

    for memory_type, topic, content in domains:
        actions = [
            MemoryActionFromLLM(
                action="create",
                memory_id=None,
                memory_type=memory_type,
                topic=topic,
                content=content,
                reasoning="Test.",
            )
        ]
        memory_service.apply_memory_actions(db, user.id, actions)

    memories = memory_service.get_user_memories(db, user.id)
    assert len(memories) == len(domains)

    topics = {m.topic for m in memories}
    for _, topic, _ in domains:
        assert topic in topics


# ---------------------------------------------------------------------------
# 7. Retire action removes outdated memory
# ---------------------------------------------------------------------------

def test_retire_action_removes_memory(db):
    user = _make_user(db, "user@test.com")
    memory = _make_memory(db, user.id, "plan", "Old Plan", {"plan": "outdated"})

    actions = [
        MemoryActionFromLLM(
            action="retire",
            memory_id=memory.id,
            memory_type="plan",
            topic="Old Plan",
            content={},
            reasoning="Plan is obsolete after user changed direction.",
        )
    ]
    memory_service.apply_memory_actions(db, user.id, actions)

    remaining = memory_service.get_user_memories(db, user.id)
    assert remaining == []


# ---------------------------------------------------------------------------
# 8. format_memories_for_prompt output
# ---------------------------------------------------------------------------

def test_format_memories_for_prompt_empty(db):
    result = memory_service.format_memories_for_prompt([])
    assert result == ""


def test_format_memories_for_prompt_contains_key_fields(db):
    user = _make_user(db, "user@test.com")
    m = _make_memory(db, user.id, "progress", "LeetCode Practice", {"completed": 5})
    memories = memory_service.get_user_memories(db, user.id)

    result = memory_service.format_memories_for_prompt(memories)

    assert "User Memory" in result
    assert "LeetCode Practice" in result
    assert "progress" in result
    assert str(m.id) in result


# ---------------------------------------------------------------------------
# 9. serialize_memories_for_llm output shape
# ---------------------------------------------------------------------------

def test_serialize_memories_for_llm(db):
    user = _make_user(db, "user@test.com")
    _make_memory(db, user.id, "knowledge", "Topic A", {"fact": "x"})
    memories = memory_service.get_user_memories(db, user.id)

    serialized = memory_service.serialize_memories_for_llm(memories)

    assert len(serialized) == 1
    assert set(serialized[0].keys()) == {"id", "memory_type", "topic", "content"}
    assert serialized[0]["memory_type"] == "knowledge"
    assert serialized[0]["topic"] == "Topic A"
    assert serialized[0]["content"] == {"fact": "x"}


# ---------------------------------------------------------------------------
# 10. MemoryExtractionFromLLMSchema parses correctly
# ---------------------------------------------------------------------------

def test_memory_extraction_schema_parses_valid_json():
    raw = """
    {
      "actions": [
        {
          "action": "create",
          "memory_id": null,
          "memory_type": "progress",
          "topic": "LeetCode Practice",
          "content": {"completed_problems": ["Two Sum"]},
          "reasoning": "User completed a problem."
        }
      ]
    }
    """
    parsed = MemoryExtractionFromLLMSchema.model_validate_json(raw)
    assert len(parsed.actions) == 1
    assert parsed.actions[0].action == "create"
    assert parsed.actions[0].memory_type == "progress"


def test_memory_extraction_schema_empty_actions():
    raw = '{"actions": []}'
    parsed = MemoryExtractionFromLLMSchema.model_validate_json(raw)
    assert parsed.actions == []
```

### Test results

```
============================= test session starts =============================
platform win32 -- Python 3.11.2, pytest-9.1.1
collected 15 items

tests/test_memory.py::test_empty_actions_creates_no_memory PASSED
tests/test_memory.py::test_none_action_creates_no_memory PASSED
tests/test_memory.py::test_create_action_persists_memory PASSED
tests/test_memory.py::test_previous_memory_available_in_next_conversation PASSED
tests/test_memory.py::test_update_action_merges_into_existing_memory PASSED
tests/test_memory.py::test_user_isolation PASSED
tests/test_memory.py::test_update_cannot_mutate_other_users_memory PASSED
tests/test_memory.py::test_retire_cannot_delete_other_users_memory PASSED
tests/test_memory.py::test_flexible_content_different_domains PASSED
tests/test_memory.py::test_retire_action_removes_memory PASSED
tests/test_memory.py::test_format_memories_for_prompt_empty PASSED
tests/test_memory.py::test_format_memories_for_prompt_contains_key_fields PASSED
tests/test_memory.py::test_serialize_memories_for_llm PASSED
tests/test_memory.py::test_memory_extraction_schema_parses_valid_json PASSED
tests/test_memory.py::test_memory_extraction_schema_empty_actions PASSED

============================== 15 passed in 0.66s ==============================
```

---

## 15. Files Changed Summary

### New files

| File | Description |
|---|---|
| `app/models/memory.py` | `UserMemoryDBM` — SQLAlchemy model for the `user_memories` table |
| `app/schemas/memory.py` | `MemoryActionFromLLM`, `MemoryExtractionFromLLMSchema` — LLM output schemas |
| `app/services/memory_service.py` | Memory CRUD operations and prompt formatting |
| `tests/test_memory.py` | 15 tests covering all scenarios |
| `docs/ASSISTANT_MEMORY_SYSTEM.md` | This document |

### Modified files

| File | What changed |
|---|---|
| `app/models/__init__.py` | — (no `__init__.py` exists; model imported directly in `main.py`) |
| `app/main.py` | Added `from app.models.memory import UserMemoryDBM` for table creation at startup |
| `app/schemas/memory.py` | New file |
| `app/llm/models.py` | Added `user_memory: str = ""` to `NewConvoToLLM` and `MessageToLLM`; added `ExtractUserMemoryToLLM` and `ExtractUserMemoryFromLLM` classes; added import for `MemoryExtractionFromLLMSchema` |
| `app/llm/base.py` | Added abstract `extract_user_memory()` method; added imports for new model types |
| `app/llm/service.py` | Added `user_memory` parameter to `create_conversation()` and `respond_to_message()`; added new `extract_user_memory()` method; added imports |
| `app/llm/knowledge_base.py` | Added import for `MemoryExtractionFromLLMSchema`; added `_MEMORY_EXTRACTION_INSTRUCTION` and `USER_MEMORY_EXTRACTION_SYSTEM_INSTRUCTION` |
| `app/llm/providers/claude.py` | Added `USER_MEMORY_EXTRACTION_SYSTEM_INSTRUCTION` import; added `MemoryExtractionFromLLMSchema` import; added `ExtractUserMemoryToLLM`/`From` imports; added `_parse_MemoryExtractionFromLLMSchema()`; added `extract_user_memory()` method; updated `create_conversation()` and `respond_to_message()` to inject `user_memory` into system prompt |
| `app/llm/providers/openai.py` | Added `extract_user_memory()` stub (`NotImplementedError`) |
| `app/llm/providers/gemini.py` | Added `extract_user_memory()` stub (`NotImplementedError`) |
| `app/llm/providers/ollama.py` | Added `extract_user_memory()` stub (`NotImplementedError`) |
| `app/llm/__init__.py` | Added exports for `ExtractUserMemoryToLLM` and `ExtractUserMemoryFromLLM` |
| `app/services/chat_service.py` | Added `from app.services import memory_service`; updated `create_conversation()` to load/inject memories; updated `_call_llm_and_save()` to accept/pass `user_memory`; updated `respond_to_message()` to load memories, fire `memory_task` concurrently, and apply actions; updated `regenerate_response()` to load/inject memories |

---

## 16. Architectural Decisions and Limitations

### Decision: Shared trigger with context summary

Memory extraction fires on the same threshold as the context summary update (`chat_summary_update_user_messages`, default 10). Both tasks run concurrently as `asyncio.create_task()`.

**Why:** The context summary update already processes the full message window at a sensible cadence. Piggyback is zero-cost for scheduling complexity. Running both together means the LLM sees consistent conversation state for both operations.

**Limitation:** The first 9 messages of a conversation are never evaluated for memory. Information mentioned early and never repeated will only be captured at message 10. Short conversations below the threshold produce no memory updates.

### Decision: Top-20 by recency (no vector search)

V1 retrieves the 20 most recently updated memories and injects them all.

**Why:** At current user scale, users won't have dozens of memories. Simple and reliable. No infrastructure complexity.

**Limitation:** As a user's memory count grows beyond 20, older memories are silently excluded from the prompt. The 20 most recently updated are not necessarily the most relevant to the current conversation. This is the primary scaling limitation of V1.

**V2 path:** Topic-based filtering (e.g., filter by agent_type, or keyword matching on the topic field) is the natural next step before introducing embeddings.

### Decision: `retire` is a hard delete

When a memory is retired, the row is permanently deleted. No soft-delete, no `is_active` flag.

**Why:** Simplicity. Retained but inactive memories would still consume prompt tokens and clutter future context. If the information was wrong or outdated, it should disappear.

**Limitation:** There's no audit trail of what was previously remembered. If the LLM incorrectly retires a valid memory, it's gone. The LLM will recreate it if the topic comes up again in a future conversation.

### Decision: Claude-only for extraction in V1

OpenAI, Gemini, and Ollama have `NotImplementedError` stubs.

**Why:** The project is currently Claude-only in production. Writing and testing three additional provider implementations for a feature that hasn't launched yet would add unnecessary complexity.

**Limitation:** If `LLM_PROVIDER` is changed to OpenAI, Gemini, or Ollama, memory extraction will raise `NotImplementedError`. The error surfaces in the `except Exception:` handler in `respond_to_message`, gets logged as a warning, and the conversation response still returns normally.

### Decision: No API endpoints for memory management

There are no `/memory` REST endpoints for listing, editing, or deleting memories.

**Why:** In V1, memory is entirely LLM-managed. The user doesn't need to interact with it directly. Adding endpoints would also require frontend changes.

**V2 path:** A user-facing memory management page (list memories, delete specific ones, edit content) would make the system more transparent and controllable.

### Decision: `reasoning` field not stored

The `reasoning` field in `MemoryActionFromLLM` exists only in the schema and is never persisted to the database.

**Why:** It serves as a chain-of-thought nudge to improve LLM decision quality. Storing it adds a column with no query use. It can be logged at debug level if tracing is needed.

### Decision: Memory content is fully replaced on update (not merged)

When the LLM returns `action: "update"`, the `content` field completely replaces the existing content. The backend does not attempt to merge the old and new JSON.

**Why:** Merging JSON structures generically is complex and error-prone. The LLM is instructed to include the complete merged content in its update action. This keeps the backend simple and makes the LLM responsible for the merge logic, which it can do correctly given it has seen both the existing memory and the new conversation.

---

## 17. Example — End-to-End Scenario

### Setup

User: Harsh  
Goal: Prepare for FAANG interviews via LeetCode  
Active conversations: multiple over several days

---

### Day 1 — First LeetCode conversation, messages 1-10

**Messages 1-9:** Harsh discusses arrays. Completes "Two Sum" and "Valid Parentheses". Asks about hash maps.

**Message 10** (threshold reached):

`summary_update_due = True`

Three LLM calls fire concurrently:
1. **Main response** — answers Harsh's message about hash maps
2. **Context update** — `update_conversation_context` updates `context_summary` for this conversation
3. **Memory extraction** — `extract_user_memory` evaluates the conversation

Memory extraction user prompt:
```
Existing user memories:
[]

Conversation to analyze:
Stable context:
Harsh is preparing for FAANG software engineering interviews...

Conversation summary:
Discussed array traversal. Completed Two Sum and Valid Parentheses.
Moved to hash map problems. Questions about when to use HashMap vs. array.

Recent messages:
[user]: I just finished Two Sum and Valid Parentheses.
[assistant]: Great! Both use the hash map pattern...
[user]: When should I use a HashMap vs array?
...
```

Memory extraction response from Claude:
```json
{
  "actions": [
    {
      "action": "create",
      "memory_id": null,
      "memory_type": "progress",
      "topic": "LeetCode Practice",
      "content": {
        "completed_problems": ["Two Sum", "Valid Parentheses"],
        "topics_covered": ["arrays", "hash maps"],
        "current_focus": "hash map patterns",
        "weak_areas": []
      },
      "reasoning": "User completed two problems and is actively building LeetCode skills."
    }
  ]
}
```

`apply_memory_actions` creates `UserMemoryDBM(id=3, user_id=1, memory_type="progress", topic="LeetCode Practice", content={...})`.

---

### Day 3 — New conversation, first message

Harsh opens a new conversation: *"Let's do more LeetCode today."*

`create_conversation` fires:

1. `memory_service.get_user_memories(db, harsh_id)` → returns `[UserMemoryDBM(id=3, ...)]`
2. `format_memories_for_prompt(memories)`:
   ```
   User Memory (persisted from previous conversations):
   [progress | LeetCode Practice (id:3)]: {"completed_problems": ["Two Sum", "Valid Parentheses"], "topics_covered": ["arrays", "hash maps"], "current_focus": "hash map patterns", "weak_areas": []}
   ```
3. This string is appended to the system prompt.
4. Claude sees Harsh's two completed problems immediately — without Harsh repeating them.

Claude's response: *"Welcome back! You've already covered Two Sum and Valid Parentheses. Ready to move into binary search, or would you like more hash map practice first?"*

---

### Day 3 — Message 10 of the new conversation (threshold)

Harsh completed "Binary Search" and "Find Minimum in Rotated Array" during this session.

Memory extraction fires again. This time `existing_memories` includes `id:3`.

Memory extraction response:
```json
{
  "actions": [
    {
      "action": "update",
      "memory_id": 3,
      "memory_type": "progress",
      "topic": "LeetCode Practice",
      "content": {
        "completed_problems": ["Two Sum", "Valid Parentheses", "Binary Search", "Find Minimum in Rotated Array"],
        "topics_covered": ["arrays", "hash maps", "binary search"],
        "current_focus": "binary search edge cases",
        "weak_areas": ["boundary conditions in binary search"]
      },
      "reasoning": "User completed 2 more problems and identified a specific weak area."
    }
  ]
}
```

`apply_memory_actions` updates row `id=3` with the complete merged content. No duplicate row is created.

---

### Day 5 — Harsh opens a Career conversation

Harsh opens a new conversation with the Career Advisor agent.

`create_conversation` fires. Memories are still loaded (they're user-scoped, not agent-scoped):

```
User Memory (persisted from previous conversations):
[progress | LeetCode Practice (id:3)]: {"completed_problems": ["Two Sum", "Valid Parentheses", "Binary Search", "Find Minimum in Rotated Array"], "topics_covered": ["arrays", "hash maps", "binary search"], "current_focus": "binary search edge cases", "weak_areas": ["boundary conditions in binary search"]}
```

Career Advisor can see this context. If Harsh asks "What FAANG companies should I target?", the advisor knows he's actively practicing LeetCode and is at binary search level — it can give a more calibrated answer about timeline and preparation gap without Harsh explaining his situation from scratch.

---

*End of document.*
