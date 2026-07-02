# FrontEnd — Shadow Web App

> **Quick reference for agents working in `FrontEnd/`.** The root
> [README.md](../README.md) is the **project source of truth** — read it for full context
> (audience, product vision, agents, roadmap). This file is the fast on-ramp for frontend work.

---

## Purpose
The React single-page app is the user's window into Shadow: onboarding interview, dashboard,
goals & milestones, metrics/tracking, daily/weekly reports, AI chat, journal, and notifications.
It is a **static build deployed to Firebase Hosting** and talks to the backend (private server)
over REST/JSON at `VITE_API_BASE_URL`.

## Tech Stack
| Concern       | Choice                                                     |
| ------------- | ---------------------------------------------------------- |
| Framework     | **React 18** + **TypeScript**                              |
| Build tool    | **Vite**                                                   |
| UI / Styling  | **Bootstrap 5** + **React-Bootstrap**, responsive         |
| Theming       | **Light + Dark** via Bootstrap 5.3 `data-bs-theme`        |
| Routing       | **React Router**                                           |
| HTTP client   | **Axios** (typed API client in `src/api/`)                |
| State/context | React Context for **auth** + **theme**                     |
| Testing       | **Vitest** + **React Testing Library**                     |
| Hosting       | **Firebase Hosting**                                       |

## Quick Start
```powershell
cd FrontEnd
npm install
Copy-Item .env.example .env   # set VITE_API_BASE_URL (defaults to http://localhost:8000/api)
npm run dev                   # dev server at http://localhost:5173
```
Scripts: `npm run build` (type-check + production bundle) • `npm run test` /
`npm run test:coverage` (Vitest) • `npm run preview` (serve the build) •
`firebase deploy` (Hosting).

## Project Structure
```
FrontEnd/
├── src/
│   ├── main.tsx            # entry: Router + AppProviders + Bootstrap/theme CSS
│   ├── App.tsx             # route table (public / onboarding / app shells)
│   ├── api/                # typed Axios client + one module per domain + types.ts
│   ├── components/
│   │   ├── layout/         # AppLayout, Sidebar, Topbar, AuthLayout, NotificationsBell
│   │   ├── routing/        # RequireAuth / RequireOnboarded / PublicOnly guards
│   │   ├── ui/             # design-system primitives (Brand, StatCard, ProgressRing…)
│   │   ├── goals/ metrics/ chat/ reports/ tasks/   # feature components
│   ├── context/            # AuthProvider, ThemeProvider, ToastProvider, AppProviders
│   ├── hooks/              # useAsync (data loading)
│   ├── lib/                # format, agents, labels, nav, metrics helpers
│   ├── pages/              # auth, onboarding, dashboard, goals, plan, track,
│   │                       # reports, chat, journal, notifications, settings
│   ├── styles/theme.css    # CSS-variable design system (light + dark)
│   └── test/setup.ts       # Vitest + jest-dom setup
├── index.html
├── package.json · tsconfig*.json · vite.config.ts
├── firebase.json · .firebaserc      # Firebase Hosting (SPA rewrites)
└── .env.example
```

## Pages & Features (Step 5)
- **Auth** — split-screen login & register (JWT, auto-detected timezone).
- **Onboarding** — conversational AI interview; shows each generated "understanding".
- **Dashboard** — greeting, task-completion ring, streaks, metric mini-cards, active
  goals, today's plan, unread nudges. Metrics-first, per the behavioral insight.
- **Today (Plan)** — date-navigable planned tasks with quick capture & completion ring.
- **Goals** — filterable cards; detail page with milestones (progress auto-recomputes).
- **Track** — metric cards with 7-day sparklines, streaks, target rings, quick logging.
- **Reports** — generate daily/weekly reports; modal detail with narrative + next steps.
- **Assistant** — multi-agent chat (Goal Coach, Career Advisor, …) with suggestions.
- **Journal** — reflections with mood; **Notifications** center; **Settings** (profile,
  appearance, and the editable "what Shadow knows" memory list).

## Environment Variables (`.env`)
```
VITE_API_BASE_URL=http://localhost:8000/api
```
Only `VITE_`-prefixed vars are exposed to the client — **never put secrets here**.

## Architecture Rules (do not violate)
- **One typed API client** in `src/api/` — components never call `fetch`/`axios` directly; they
  use the client, which attaches the JWT and handles errors centrally.
- **Pages compose components** — keep pages thin; put reusable UI in `components/`.
- **Auth + theme via Context** — read the JWT/user from `AuthProvider`; toggle light/dark via
  `ThemeProvider` (sets `data-bs-theme` on `<html>`).
- **Responsive first** — must look clean on **desktop and mobile** (Bootstrap grid/utilities).
- **TypeScript everywhere** — type API responses; avoid `any`.

## Theming (light/dark)
Use Bootstrap 5.3 color modes: set `data-bs-theme="light|dark"` on the root element from
`ThemeProvider`, persist the choice (localStorage), and default from the user's
`theme_preference`. Prefer Bootstrap variables/utilities over hardcoded colors.

## Testing Conventions
- **Vitest + React Testing Library**; test behavior/user interactions, not implementation.
- **Mock the API client** — no real network in unit tests.
- **≥80% coverage** on new/changed code.

## Deployment (Firebase Hosting)
`npm run build` → `dist/`, then `firebase deploy`. Ensure the production `VITE_API_BASE_URL`
points to the private backend server and that the backend's `CORS_ORIGINS` includes the Firebase
Hosting domain.
