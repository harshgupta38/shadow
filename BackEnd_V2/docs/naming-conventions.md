# Class Naming Conventions

Suffix-based naming so a class's role is obvious from its name alone, without opening the file.

## `DBM` — Database Model
SQLAlchemy ORM model (`app/models/*.py`), maps directly to a table.
```python
class UserDBM(Base): ...
class ConversationDBM(Base): ...
class MessageDBM(Base): ...
```

## `DBS` — Database Schema
Pydantic schema (`app/schemas/*.py`) that mirrors a `DBM` row and is built via
`SomeDBS.model_validate(orm_object)`. Always extends `ORMModel` (from
`app.schemas.common`), never plain `BaseModel`.
```python
class ConvoDataShortDBS(ORMModel): ...   # list-view projection
class ConvoDataLongDBS(ORMModel): ...    # detail-view projection
class MessageDataDBS(ORMModel): ...
```
Use `Short` / `Long` (not `List` / `Detail`) when a model needs two projections.

## `Request` — Incoming API Payload
Pydantic schema for data the frontend sends to an endpoint. Plain `BaseModel`
(not validated from the DB).
```python
class NewConvoRequest(BaseModel): ...
class LoginRequest(BaseModel): ...
```

## `Response` — Outgoing API Payload
Pydantic schema for data an endpoint returns that isn't a direct 1:1 DB mirror —
usually assembled by a service from multiple sources (DB rows, LLM output, computed
fields). Plain `BaseModel`.
```python
class NewConvoResponse(MetadataFromLLM): ...
class MessageChunkResponse(BaseModel): ...
class TokenResponse(BaseModel): ...
```
If a `Response` schema *is* just a plain DB mirror with no extra assembly, use
`DBS` instead — `Response` implies composition beyond a single table.

## `ToLLM` / `FromLLM` — Backend ↔ LLM Provider
Only used inside `app/llm/`, for the internal contract between `LLMService` and a
`BaseLLMProvider` implementation. Never exposed to the frontend.

- `MetadataToLLM` / `MetadataFromLLM` — shared base fields (model, temperature,
  usage, cost, etc.) that every provider call carries.
- `<Feature>ToLLM(MetadataToLLM)` — request sent into a provider method, wraps the
  actual payload in `request_data`.
- `<Feature>FromLLM(MetadataFromLLM)` — draft/intermediate result a provider
  returns after parsing the LLM's raw output, wraps it in `llm_data`.
```python
class RefineGoalToLLM(MetadataToLLM):
    request_data: UnderstandGoalRequest

class RefineGoalFromLLM(MetadataFromLLM):
    refined_data: UnderstandGoalResponse

class NewConvoToLLM(MetadataToLLM):
    request_data: NewConvoRequest

class NewConvoFromLLM(MetadataFromLLM):
    llm_data: NewConvoFromLLMSchema
```

## `Schema` — Raw LLM Output Shape
Lives in `app/schemas/*.py` (not `app/llm/`), because it's also referenced by
provider prompt-building code. Defines exactly what the LLM must return
(passed as `response_format=...`). Suffix `FromLLMSchema` to avoid colliding
with the `FromLLM` wrapper of the same feature in `app/llm/models.py`.
```python
class NewConvoFromLLMSchema(BaseModel):
    title: str
    content: str
    stable_context: str
    context_summary: str
```
**Never reuse a bare name across `app/schemas/` and `app/llm/models.py`** — if
both a wrapper and its raw schema exist for the same feature, one of them must
carry the `Schema` suffix, or a shadowed-import bug becomes possible.

## Quick reference

| Suffix | Base class | Where | Built by |
|---|---|---|---|
| `DBM` | `Base` | `app/models/` | SQLAlchemy |
| `DBS` | `ORMModel` | `app/schemas/` | `.model_validate(orm_obj)` |
| `Request` | `BaseModel` | `app/schemas/` | FastAPI request body |
| `Response` | `BaseModel` | `app/schemas/` | Service-assembled, multi-source |
| `ToLLM` | `MetadataToLLM` | `app/llm/models.py` | `LLMService` before calling a provider |
| `FromLLM` | `MetadataFromLLM` | `app/llm/models.py` | Provider after parsing LLM output |
| `FromLLMSchema` | `BaseModel` | `app/schemas/` | The LLM itself (via `response_format`) |
