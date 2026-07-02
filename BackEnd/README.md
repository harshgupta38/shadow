# BackEnd — Shadow API & AI Layer

> **Quick reference for agents working in `BackEnd/`.** The root
> [README.md](../README.md) is the **project source of truth** — read it for full context
> (audience, product vision, data model, roadmap). This file is the fast on-ramp for backend work.

---

## Purpose
The FastAPI backend powers everything: auth, onboarding, goals, metrics, reports, the AI agents,
and user memory. It runs **persistently on a private server (24/7)** and is the **single source
of truth for auth and data** (JWT + SQLite). The frontend (Firebase Hosting) talks to it over a
REST/JSON API prefixed with `/api`.

## Tech Stack
| Concern      | Choice                                                        |
| ------------ | ------------------------------------------------------------- |
| Framework    | **FastAPI** (Python 3.11+)                                    |
| ORM          | **SQLAlchemy 2.x** + **Alembic** migrations                   |
| Database     | **SQLite** (MVP) — ORM-abstracted for easy PostgreSQL later   |
| Validation   | **Pydantic v2** (schemas)                                     |
| Auth         | **JWT** (python-jose) + **bcrypt** (passlib)                  |
| AI / LLM     | **Google Gemini** behind a pluggable `LLMProvider` interface  |
| Scheduling   | **APScheduler** (reminders + report jobs)                     |
| Testing      | **pytest** + **httpx** `TestClient`                           |

## Quick Start
```powershell
cd BackEnd
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env   # then fill in secrets
uvicorn app.main:app --reload # dev server at http://localhost:8000
```
Run tests: `pytest` • Migrations: `alembic upgrade head` / `alembic revision --autogenerate -m "..."`

## Project Structure
```
BackEnd/
├── app/
│   ├── main.py        # FastAPI entrypoint (app, routers, middleware)
│   ├── constant.py    # central keys/config (API keys, CORS/FrontEnd URL, version)
│   ├── database.py    # SQLAlchemy engine/session
│   ├── models/        # ORM models (one concern per file)
│   ├── schemas/       # Pydantic request/response models
│   ├── api/           # routers: auth, onboarding, goals, metrics, reports, chat, ...
│   ├── agents/        # agent personas (system prompts) + orchestration
│   ├── llm/           # LLMProvider interface + GeminiProvider
│   ├── memory/        # User Context Document compilation + behavior learning
│   ├── services/      # business logic (kept out of routers)
│   └── scheduler/     # APScheduler jobs (reminders, report generation)
├── alembic/           # migrations
├── tests/             # pytest (mirrors app/ layout)
├── requirements.txt
└── .env.example
```

## Environment Variables (`.env`)
```
DATABASE_URL=sqlite:///./shadow.db
JWT_SECRET=change-me
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
LLM_PROVIDER=gemini            # or "fake" for offline dev/tests
GEMINI_API_KEY=your-key
GEMINI_MODEL=gemini-1.5-flash
CORS_ORIGINS=http://localhost:5173
ENABLE_SCHEDULER=true
```
Never commit real secrets. All config is read only through `app/constant.py` (the single
source of truth for keys/config).

## Data Models (quick list — details in root §8)
`User` • `MemoryEntry` • `Goal` • `Milestone` • `ChatSession` • `ChatMessage` • `JournalEntry`
• `Notification` • `TrackedMetric` • `ActivityLog` • `PlannedTask` • `Report`.

## API Surface (quick list — details in root §9)
`auth` • `onboarding` • `profile`/memories • `goals`/`milestones` • `metrics`/`plan` • `reports`
• `chat` • `journal` • `notifications` • `dashboard`. All under `/api`, JWT-protected except
register/login.

## Architecture Rules (do not violate)
- **Never call Gemini directly** from routers/services — always go through `app/llm` (`LLMProvider`).
  Swapping providers must never touch feature code.
- **Routers stay thin** — put business logic in `services/`, DB models in `models/`, IO shapes in
  `schemas/`.
- **Agents** live in `app/agents/` as versioned personas (system prompt + context injection).
- **Memory**: agents receive the compiled **User Context Document** from `app/memory/`; behavior
  signals are distilled back into `MemoryEntry` (`source=behavior`).
- **Config via env only** (12-factor); no hardcoded secrets or paths.

## Testing Conventions
- **TDD**: write a failing test first, then minimal code.
- **Mock ALL LLM/network/time** — unit tests must be fast and hermetic. Provide a fake
  `LLMProvider` for agent tests.
- API tests use httpx `TestClient` against an in-memory/temp SQLite DB.
- **≥80% coverage** on new/changed code; assert behavior, not lines.

## Security
Hash passwords with bcrypt; validate all input via Pydantic; lock CORS to known origins; keep
secrets in env; never log sensitive data or leak it in error responses.
