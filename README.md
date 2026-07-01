# Jarvis — Your Personal Life & Career Assistant

> **⚠️ AI-FIRST SOURCE OF TRUTH**
> This README is the **single source of truth** for the Jarvis project. Every AI developer
> (and human) working on this codebase **must read this file first**. If you ever lose context,
> re-read this document top to bottom before writing any code. Keep this file **up to date** —
> whenever architecture, data models, APIs, or conventions change, update this README in the
> same change set.

---

## 1. Project Overview

**Jarvis** is a personal assistant web application that helps its users reach their **life and
career goals**. It combines structured goal tracking with a suite of **AI agents** that coach,
advise, and hold users accountable — all personalized using a memory built during an AI-driven
onboarding interview.

### Vision
A calm, minimal, always-available companion that *knows you* — your ambitions, your working
style, your progress — and proactively helps you move forward, one milestone at a time.

### Who it's for
- A **private group of ~10–20 friends** (small, trusted, invite-scale user base).
- Not a public product (for now). Design decisions favor **simplicity and clarity** over
  hyperscale, but the architecture is kept clean enough to grow.

### Target Audience (design for this person)
- **24–30 year-old corporate employees**, early in their careers.
- **Distracted by social media**, struggling to focus on their career and life goals.
- Motivated by **visible progress**: they stay aligned when they can *see* concrete metrics
  about what they did.

### The Core Problem
Our users *have* ambitions but lose momentum to distraction and lack of feedback. They don't need
more information — they need **guidance, structure, and a mirror** that shows them whether today
moved them forward.

### The Behavioral Insight (why metrics matter) ⭐
Users stay on track when they see **detailed, quantified reports** of their day/week:
- *"You completed 6 / 8 planned tasks."*
- *"You solved 3 LeetCode problems (streak: 5 days)."*
- *"Deep-work time: 2h 40m. Goal: 3h."*

A clear daily/weekly report makes them **more likely to stay aligned the next day/week**.
Therefore **metrics, tracking, and reporting are first-class features**, not add-ons.

### The Core Loop (what Jarvis optimizes)
```
  PLAN  ─▶  DO  ─▶  TRACK  ─▶  REPORT / REFLECT  ─▶  ADAPT
   ▲                                                    │
   └──────────────  (Jarvis guides every step)  ────────┘
```
1. **Plan** — agents help set goals, milestones, and daily/weekly plans.
2. **Do** — the user works on tasks.
3. **Track** — the user (and later, integrations) log metrics (tasks done, LeetCode solved, etc.).
4. **Report / Reflect** — Jarvis generates a quantified daily/weekly report + insights.
5. **Adapt** — Jarvis learns the user's evolving behavior and adjusts guidance.

### Adaptive Learning (Jarvis gets to know you over time)
Jarvis **auto-learns new user behaviors as they use the app** — not just at onboarding. Patterns
(when they're productive, what they follow through on, where they stall) are continuously
captured as memory and folded into future guidance. See §7.3.

### Guiding Mission
> As a personal assistant, Jarvis's **primary job is to guide the user and keep them on the right
> path** toward their life and career goals — gently, with data, and without adding to the noise
> they're already drowning in.

---

## 2. Core Principles (read before coding)

These come from the org engineering standards and this project's needs:

- **DRY** — no duplication in production or test code. Extract reusable modules/components.
- **TDD by default** — write a failing test first, then minimal code to pass.
- **Fast, hermetic unit tests** — mock IO, time, randomness, and **all LLM/network calls**.
- **≥80% coverage** on new/changed code.
- **12-Factor** — config in environment variables, stateless processes, logs as streams.
- **Security first** — validate inputs, hash passwords, secrets out of code, least privilege.
- **AI provider is pluggable** — never hard-couple feature code to Gemini. Always go through
  the LLM provider abstraction (see §7).
- **Update this README** with every meaningful change.

---

## 3. Tech Stack

| Layer            | Technology                                                            |
| ---------------- | --------------------------------------------------------------------- |
| **Frontend**     | React 18 + **TypeScript** + **Vite**                                  |
| **UI / Styling** | **Bootstrap 5** (+ React-Bootstrap), responsive, **light + dark**     |
| **Routing**      | React Router                                                          |
| **HTTP client**  | Axios (typed API client)                                              |
| **Backend**      | **Python 3.11+** + **FastAPI**                                        |
| **ORM**          | SQLAlchemy 2.x + Alembic (migrations)                                 |
| **Database**     | **SQLite** (MVP) — abstracted via ORM for easy PostgreSQL migration   |
| **Auth**         | Email + password, **JWT** (python-jose), **bcrypt** hashing (passlib) |
| **AI / LLM**     | **Google Gemini** via official SDK, behind a pluggable provider layer |
| **Scheduling**   | APScheduler (reminders / notifications) — runs on 24/7 server         |
| **Validation**   | Pydantic v2                                                           |
| **Testing**      | Backend: pytest + httpx; Frontend: Vitest + React Testing Library     || **Hosting**      | Frontend: **Firebase Hosting**; Backend: **private server (24/7)**    |
| **Firebase**     | Hosting now; optional services (FCM push, Analytics, etc.) as needed  |
---

## 4. High-Level Architecture

```
┌──────────────────────────────┐         HTTPS / JSON          ┌──────────────────────────────┐
│          FrontEnd            │  ─────────────────────────▶   │           BackEnd            │
│  React + TS + Vite + Boot    │   REST API (configurable      │  FastAPI (24/7 private server)│
│                              │   VITE_API_BASE_URL)          │                              │
│  - Auth / Onboarding UI      │  ◀─────────────────────────   │  - Auth & JWT                │
│  - Dashboard                 │                               │  - Onboarding interview      │
│  - Goals & Milestones        │                               │  - Goals / Milestones        │
│  - AI Chat (agents)          │                               │  - AI Agent orchestration    │
│  - Journal                   │                               │  - Memory / User Context     │
│  - Notification center       │                               │  - Notifications scheduler   │
│  - Light/Dark theme          │                               │                              │
└──────────────────────────────┘                               └───────────────┬──────────────┘
                                                                                 │
                                                          ┌──────────────────────┼──────────────────────┐
                                                          │                      │                      │
                                                   ┌──────▼──────┐        ┌──────▼──────┐        ┌──────▼──────┐
                                                   │   SQLite    │        │ LLM Provider│        │ APScheduler │
                                                   │  (SQLAlch)  │        │  (Gemini)   │        │  reminders  │
                                                   └─────────────┘        └─────────────┘        └─────────────┘
```

- **Deployment:**
  - **Frontend** — static Vite build deployed to **Firebase Hosting**; talks to the backend via
    `VITE_API_BASE_URL`.
  - **Backend** — FastAPI running persistently on a **private server, online 24/7**; CORS allows
    the Firebase Hosting origin.
  - **Firebase services** are available as needed — Hosting is used now; **FCM** (push
    notifications), Analytics, etc. are optional future add-ons. **Auth and data stay
    backend-owned** (JWT + SQLite) so there is a single source of truth.

---

## 5. Key User Flows

### 5.1 Onboarding — the AI Interview (the heart of personalization)
When a user **first creates an account**, they go through a guided **AI interview**:

1. The app presents a sequence of questions covering **daily, weekly, monthly, career, and life
   goals** (plus personality / working style).
2. After **each answer**, an AI agent (the **Onboarding Interviewer**) generates a concise
   **"understanding" text** — an interpreted summary of what this answer reveals about the user.
3. Each understanding is **saved per-user** as a `MemoryEntry`.
4. These understandings are later compiled into the **User Context Document** and injected into
   every agent's prompt, so all agents "know" the user.

> This is what makes Jarvis feel personal. Treat the onboarding memory as a first-class feature.

### 5.2 Goal Setup
- The AI can **suggest a goal title** (often phrased as a guiding question), and the user adds a
  **detailed description**, **category**, and **target date**.
- Goals are broken into **milestones** (by the user and/or the Goal Coach agent).
- Progress is tracked per goal (via milestone completion and/or manual progress %).

### 5.3 Daily Use
- **Dashboard** shows an overview of goals, progress, upcoming milestones, and reminders.
- Users **chat with AI agents** for coaching, advice, check-ins, and analysis.
- Users write **journal / reflection** entries.
- **Reminders** surface in the in-app notification center.

### 5.4 Metrics & Tracking (the alignment engine)
- Each user has a set of **tracked metrics** — some default (planned tasks, completed tasks,
  deep-work time), some **custom** (e.g. *LeetCode solved*, *gym sessions*, *pages read*).
- Users **log activity** quickly (a number + optional note) against a metric for a given day.
- Metrics roll up into streaks, totals, and completion rates that power the reports.
- Designed so metrics can later be **auto-populated via integrations** (e.g. LeetCode, GitHub),
  but MVP starts with fast manual logging.

### 5.5 Daily & Weekly Reports (the behavioral hook)
- Jarvis generates a **daily report** and a **weekly report** summarizing planned vs. completed
  work, metric totals, streaks, and goal progress — with an **AI-written narrative + next steps**.
- Reports are the product's core retention mechanism: *see progress → stay aligned tomorrow*.
- Reports are produced by the **Progress Analyst** agent (see §6) using tracked metrics + goals.

### 5.6 Adaptive Behavior Learning
- As the user logs activity, chats, and completes (or misses) plans, Jarvis extracts
  **behavior signals** (productive times, follow-through patterns, recurring blockers).
- These are stored as evolving memory and injected into guidance so advice gets **more tailored
  over time**. See §7.3.

---

## 6. AI Agents

All agents share the injected **User Context Document** (see §7) and use the pluggable LLM
provider. Each agent = a **system prompt / persona** + context injection + optional tools.

| Agent                    | Purpose                                                             |
| ------------------------ | ------------------------------------------------------------------- |
| **Onboarding Interviewer** | Runs the onboarding interview; generates "understanding" memories. |
| **Goal Coach**           | Breaks goals into milestones and concrete action plans.             |
| **Career Advisor**       | Career paths, skills to build, job & growth guidance.               |
| **Daily Check-in / Accountability** | Daily nudges, asks how things are going, keeps user on track. |
| **Progress Analyst**     | Generates **daily/weekly reports** from tracked metrics + goals, reviews progress, spots blockers, suggests next-step adjustments. |
| **General Chat Assistant** | Open-ended Q&A companion.                                          |

**Rules for agents:**
- Never call Gemini directly from feature code — always via `llm_provider` (§7).
- Keep each agent's persona/system prompt in a dedicated, versioned location
  (`BackEnd/app/agents/`).
- All agent LLM calls must be **mockable** for tests.

---

## 7. AI Memory & LLM Provider Strategy

### 7.1 LLM Provider Abstraction (pluggable)
- Define an interface, e.g. `LLMProvider` with methods like `generate(messages, **opts)` and
  `generate_stream(...)`.
- Implement `GeminiProvider` first. Provider is selected via env (`LLM_PROVIDER=gemini`).
- Feature/agent code depends only on the interface — swapping to OpenAI/Claude/Ollama later is a
  new provider class, no feature changes.

### 7.2 Memory (MVP = simple profile injection)
- On onboarding, store interpreted **`MemoryEntry`** rows (the "understanding" texts).
- At agent-call time, compile a **User Context Document**: profile basics + all/most relevant
  memory understandings + active goals + recent progress → inject into the agent system prompt.
- **Future-proofing:** the memory store is designed so we can later add **vector embeddings +
  semantic retrieval (RAG)** — add an embeddings column/table and a retrieval step, without
  changing agent interfaces.

### 7.3 Adaptive Behavior Learning (continuous, not just onboarding)
- Memory is **not frozen after onboarding**. As users log metrics, complete/miss tasks, and
  chat, Jarvis periodically distills **behavior signals** into new/updated `MemoryEntry` rows
  (with `source = behavior`).
- Examples: *"Most productive 8–11am"*, *"Consistently skips weekend planning"*, *"Follows
  through on LeetCode but stalls on writing goals."*
- This distillation runs as a lightweight job (post-report generation and/or scheduled) using the
  LLM provider over recent activity — always **mockable** in tests.
- The result: the **User Context Document** grows richer over time, making all agents smarter
  about *this specific user*.

---

## 8. Data Model (initial)

> Implemented with SQLAlchemy models; evolved via Alembic migrations. Field lists are the
> starting point — keep this section synced with the actual models.

- **User**: `id`, `email` (unique), `hashed_password`, `name`, `timezone`,
  `theme_preference` (light/dark), `onboarding_completed` (bool), `created_at`, `updated_at`.
- **MemoryEntry** (onboarding "understandings" + evolving memory): `id`, `user_id`,
  `category` (daily/weekly/monthly/career/life/personality/other), `question`, `answer`,
  `ai_understanding` (generated text), `source` (onboarding/chat/manual), `created_at`,
  `updated_at`. *(Reserved for future: `embedding`.)*
- **Goal**: `id`, `user_id`, `title`, `description`, `category`, `status`
  (active/paused/completed/archived), `progress` (0–100), `target_date`, `created_at`,
  `updated_at`.
- **Milestone**: `id`, `goal_id`, `title`, `description`, `status` (todo/in_progress/done),
  `order`, `due_date`, `completed_at`, `created_at`.
- **ChatSession**: `id`, `user_id`, `agent_type`, `title`, `created_at`, `updated_at`.
- **ChatMessage**: `id`, `session_id`, `role` (user/assistant/system), `content`, `agent_type`,
  `created_at`.
- **JournalEntry**: `id`, `user_id`, `content`, `mood` (optional), `created_at`, `updated_at`.
- **Notification**: `id`, `user_id`, `title`, `body`, `type` (reminder/system/agent),
  `related_goal_id` (nullable), `scheduled_at`, `sent` (bool), `read` (bool), `created_at`.
- **TrackedMetric** (what a user measures): `id`, `user_id`, `key` (e.g. `leetcode_solved`),
  `label`, `unit` (count/minutes/hours/custom), `type` (default/custom), `target` (optional
  daily/weekly target), `active` (bool), `created_at`.
- **ActivityLog** (a single logged value): `id`, `user_id`, `metric_id`, `date`, `value`,
  `note` (optional), `source` (manual/integration), `created_at`.
- **PlannedTask** (daily/weekly plan items for planned-vs-done metrics): `id`, `user_id`,
  `title`, `date`, `status` (planned/done/missed), `related_goal_id` (nullable),
  `completed_at`, `created_at`.
- **Report** (generated daily/weekly summary): `id`, `user_id`, `period` (daily/weekly),
  `period_start`, `period_end`, `metrics_json` (rolled-up numbers/streaks), `narrative`
  (AI-written summary), `next_steps` (AI suggestions), `created_at`.

---

## 9. API Surface (planned)

> REST, JSON, prefixed with `/api`. Protected routes require `Authorization: Bearer <JWT>`.

**Auth**
- `POST /api/auth/register` — create account (email, password, name).
- `POST /api/auth/login` — returns JWT.
- `GET  /api/auth/me` — current user.

**Onboarding**
- `GET  /api/onboarding/questions` — ordered interview questions.
- `POST /api/onboarding/answer` — submit an answer → generates & stores understanding.
- `POST /api/onboarding/complete` — mark onboarding done.

**Profile & Memory**
- `GET  /api/profile` / `PUT /api/profile`
- `GET  /api/profile/memories` — list a user's understandings.

**Goals & Milestones**
- `GET/POST /api/goals`, `GET/PUT/DELETE /api/goals/{id}`
- `GET/POST /api/goals/{id}/milestones`, `PUT/DELETE /api/milestones/{id}`

**AI Chat**
- `GET/POST /api/chat/sessions` — list/create sessions (per agent).
- `GET  /api/chat/sessions/{id}/messages`
- `POST /api/chat/sessions/{id}/messages` — send message → AI reply (streaming where possible).

**Journal**
- `GET/POST /api/journal`, `PUT/DELETE /api/journal/{id}`

**Notifications**
- `GET /api/notifications`, `PATCH /api/notifications/{id}/read`

**Metrics & Tracking**
- `GET/POST /api/metrics` — list/create a user's tracked metrics (default + custom).
- `PUT/DELETE /api/metrics/{id}` — edit/deactivate a metric.
- `GET/POST /api/metrics/{id}/logs` — list/add activity logs for a metric.
- `GET/POST /api/plan` — list/create planned tasks (for a date); `PUT /api/plan/{id}` to complete.

**Reports**
- `GET  /api/reports?period=daily|weekly` — list past reports.
- `POST /api/reports/generate` — generate a report for a period (also runs on schedule).
- `GET  /api/reports/{id}` — a single report (metrics + narrative + next steps).

**Dashboard**
- `GET /api/dashboard/summary` — aggregated goals/progress/metrics/streaks/upcoming/notifications.

---

## 10. Repository Structure

```
Jarvis/
├── README.md            ← this file (source of truth)
├── FrontEnd/            ← React + TypeScript + Vite + Bootstrap app
└── BackEnd/             ← FastAPI + SQLAlchemy + SQLite + AI agents
```

**BackEnd layout** (implemented — Step 4):
```
BackEnd/
├── app/
│   ├── main.py              # FastAPI app entrypoint
│   ├── constant.py          # central keys/config (API keys, CORS, version)
│   ├── database.py          # SQLAlchemy engine/session
│   ├── models/              # ORM models
│   ├── schemas/             # Pydantic schemas
│   ├── api/                 # routers (auth, goals, chat, ...)
│   ├── agents/              # agent personas + orchestration
│   ├── llm/                 # LLMProvider interface + GeminiProvider
│   ├── memory/              # user context compilation
│   ├── services/            # business logic
│   └── scheduler/           # APScheduler jobs (reminders)
├── alembic/                 # migrations
├── tests/
├── requirements.txt
└── .env.example
```

**FrontEnd layout** (implemented — Step 5):
```
FrontEnd/
├── src/
│   ├── main.tsx             # entry: Router + providers + Bootstrap/theme CSS
│   ├── App.tsx              # route table (public / onboarding / app shells)
│   ├── api/                 # typed Axios client + per-domain modules + types
│   ├── pages/               # Auth, Onboarding, Dashboard, Plan, Goals, Track,
│   │                        # Reports, Assistant (chat), Journal, Notifications, Settings
│   ├── components/          # layout, routing guards, ui primitives, feature UI
│   ├── context/             # AuthProvider, ThemeProvider, ToastProvider
│   ├── hooks/               # useAsync (data loading)
│   ├── lib/                 # format, agents, labels, nav, metrics helpers
│   └── styles/              # theme.css — CSS-variable design system (light/dark)
├── index.html
├── package.json
├── tsconfig*.json
├── vite.config.ts
├── firebase.json          # Firebase Hosting config (SPA rewrites)
├── .firebaserc            # Firebase project alias
└── .env.example
```

---

## 11. Configuration (12-Factor)

All secrets/config via environment variables, read through `BackEnd/app/constant.py` (the
single source of truth for keys/config). Never commit real secrets.

**Backend `.env`**
```
DATABASE_URL=sqlite:///./jarvis.db
JWT_SECRET=change-me
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-key
GEMINI_MODEL=gemini-1.5-flash
CORS_ORIGINS=http://localhost:5173
```

**Frontend `.env`**
```
VITE_API_BASE_URL=http://localhost:8000/api
```

---

## 12. Security Notes
- Passwords hashed with **bcrypt** (never stored/logged in plaintext).
- **JWT** for stateless auth; short-ish expiry; secret from env.
- **Input validation** via Pydantic (backend) and typed forms (frontend).
- **CORS** locked to known origins.
- **Secrets** (Gemini key, JWT secret) only in env / server config — never in git.
- No sensitive data in error messages or logs.

---

## 13. Testing Strategy
- **Backend:** pytest; unit tests mock the `LLMProvider` and DB where appropriate; API tests via
  httpx `TestClient`. Time/scheduler mocked.
- **Frontend:** Vitest + React Testing Library; mock the API client.
- **Coverage:** ≥80% on new/changed code; assert behavior, not just lines.

---

## 14. Build Roadmap
- [x] **Step 1 — Requirements** (this document's inputs)
- [x] **Step 2 — README source of truth** (this file)
- [x] **Step 3 — Create `FrontEnd/` and `BackEnd/` folders**
- [x] **Step 4 — Scaffold BackEnd** (FastAPI app, config, DB, auth, AI layer, tests)
- [x] **Step 5 — Scaffold FrontEnd** (Vite + Bootstrap + auth/theme)
- [ ] **Step 6 — Onboarding interview + memory**
- [ ] **Step 7 — Goals & milestones**
- [ ] **Step 8 — AI agents + chat**
- [ ] **Step 9 — Metrics, tracking & planned tasks**
- [ ] **Step 10 — Daily/weekly reports + adaptive behavior learning**
- [ ] **Step 11 — Journal + notifications + dashboard**
- [ ] **Step 12 — Polish, tests, deploy to private server**

---

## 15. Glossary
- **Understanding / MemoryEntry** — AI-generated interpretation of a user's onboarding answer (or
  learned behavior), saved and reused to personalize agents.
- **User Context Document** — the compiled profile + memories + goals injected into agent prompts.
- **LLM Provider** — pluggable interface abstracting the AI model (Gemini today).
- **Agent** — a persona (system prompt) that uses the LLM provider + user context for a purpose.
- **Core Loop** — Plan → Do → Track → Report/Reflect → Adapt; the behavioral cycle Jarvis drives.
- **Tracked Metric** — a measurable a user follows (e.g. LeetCode solved, tasks completed).
- **Activity Log** — a single logged value for a metric on a given day.
- **Planned Task** — a day/week plan item; powers planned-vs-completed metrics.
- **Report** — an AI-generated daily/weekly summary of metrics, streaks, and progress + next steps.
- **Behavior Signal** — a pattern Jarvis learns from usage (productive times, follow-through), fed
  back into memory for adaptive guidance.

---

*Keep this README accurate. It is the map every AI and human developer navigates by.*
