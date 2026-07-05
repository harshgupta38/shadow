# BackEnd - Shadow API and AI Layer

This file is a backend-focused companion.
The canonical project source of truth is the root README at ../README.md.

---

## 1) Purpose

BackEnd contains the FastAPI application that powers:

- authentication and account lifecycle
- onboarding and memory capture
- goals, milestones, plan, metrics, reports, chat, journal, notifications
- profile/settings domains and AI personalization

The backend is the system of record for auth and data.

---

## 2) Stack

- Python 3.11+
- FastAPI
- SQLAlchemy 2.x
- Alembic
- Pydantic v2 + pydantic-settings
- JWT via python-jose
- Password hashing via passlib + bcrypt
- APScheduler
- LLM provider layer (Gemini + fake provider)

---

## 3) Quick Start

```powershell
cd BackEnd
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
alembic upgrade head
uvicorn app.main:app --reload
```

Useful URLs:

- API root: http://localhost:8000
- OpenAPI docs: http://localhost:8000/docs

---

## 4) Environment Variables

Primary variables (see .env.example for full comments):

```env
ENVIRONMENT=development
DEBUG=true

DATABASE_URL=sqlite:///./shadow.db

JWT_SECRET=change-me-to-a-long-random-string
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

LLM_PROVIDER=gemini
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.5-flash

CORS_ORIGINS=http://localhost:5173, https://shadow-pa.web.app
ENABLE_SCHEDULER=true
```

Production posture:

- switch to managed PostgreSQL by setting DATABASE_URL
- run alembic upgrade head before serving traffic

---

## 5) Code Layout

```text
BackEnd/
|- app/
|  |- main.py            # app entrypoint, CORS, lifespan, router mounting
|  |- constant.py        # central settings and constants
|  |- database.py        # engine/session setup
|  |- api/               # route modules
|  |- services/          # business logic
|  |- models/            # SQLAlchemy models
|  |- schemas/           # Pydantic contracts
|  |- llm/               # provider abstraction and implementations
|  |- memory/            # context compilation + behavior distillation
|  |- scheduler/         # scheduled jobs
|- alembic/              # schema migrations
|- tests/                # pytest suite
|- requirements.txt
|- pyproject.toml
```

---

## 6) API Domains

All routes are mounted under /api.

- auth
- onboarding
- profile
- settings
- goals
- milestones
- plan
- metrics
- reports
- chat
- journal
- notifications
- dashboard

Plan API currently includes CRUD plus AI workspace/generation endpoints:

- GET /api/plan
- POST /api/plan
- GET /api/plan/workspace
- POST /api/plan/generate-today
- PUT /api/plan/{task_id}
- DELETE /api/plan/{task_id}

---

## 7) AI and Memory Notes

- Provider abstraction lives in app/llm/base.py.
- Provider factory selection is in app/llm/factory.py.
- Gemini provider supports model override and fallback to default model if override fails.
- User model preference normalization is in app/services/settings_service.py.
- User context assembly is in app/memory/context.py.
- Behavior memory distillation is in app/memory/behavior.py.
- Manual memory refinement endpoint is POST /api/profile/memories/refine.

---

## 8) Data and Migrations

Important entities:

- User, UserProfile, UserSetting
- Goal, Milestone, PlannedTask
- TrackedMetric, ActivityLog
- Report
- ChatSession, ChatMessage
- MemoryEntry
- JournalEntry
- Notification

Current Alembic head:

- f8b7a9d1334e - AI Today workspace fields on planned tasks

Recent lineage includes journal, chat-goal, milestone-details, and repetitive-task branches:

1. d431dfd7dcd9 - initial schema
2. 93f62db4c201 - profile/settings domains
3. f2a1c0b8d90e - account and behavior settings expansion
4. 8e4a7c3f9b21 - journal shadow response
5. 6af2d19c4e7b - journal goal alignment
6. b9d8c120fca4 - chat session goal id
7. c18f6be4d2a1 - milestone details
8. af72d620c5e1 - repetitive tasks
9. f8b7a9d1334e - merge head + planned task AI metadata

Commands:

```powershell
cd BackEnd
alembic upgrade head
alembic current
```

---

## 9) Testing

Run all backend tests:

```powershell
cd BackEnd
pytest
```

Current suite status in repository:

- 14 test files
- 59 test functions

---

## 10) Operational Gotchas

- Run migrations before using persistent environments.
- Use project venv python for uvicorn/alembic to avoid environment drift.
- If LLM_PROVIDER is gemini but GEMINI_API_KEY is empty, factory falls back to fake provider.
- Profile timezone is enforced as Asia/Kolkata in profile update flow.
- BackEnd/deploy.sh exists but is currently empty.
