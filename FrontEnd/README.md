# FrontEnd — Jarvis Web App

> **Quick reference for agents working in `FrontEnd/`.** The root
> [README.md](../README.md) is the **project source of truth** — read it for full context
> (audience, product vision, agents, roadmap). This file is the fast on-ramp for frontend work.

---

## Purpose
The React single-page app is the user's window into Jarvis: onboarding interview, dashboard,
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

## Quick Start (once scaffolded in Step 5)
```powershell
cd FrontEnd
npm install
Copy-Item .env.example .env   # set VITE_API_BASE_URL
npm run dev                   # dev server at http://localhost:5173
```
Build: `npm run build` • Test: `npm run test` • Deploy: `firebase deploy` (Hosting).

## Project Structure
```
FrontEnd/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── api/          # typed Axios client + endpoint modules (auth, goals, chat, ...)
│   ├── pages/        # Auth, Onboarding, Dashboard, Goals, Metrics, Reports, Chat, Journal
│   ├── components/   # reusable presentational + shared UI
│   ├── context/      # AuthProvider, ThemeProvider
│   ├── hooks/        # custom hooks (useAuth, useTheme, data hooks)
│   └── styles/       # Bootstrap overrides, light/dark tokens
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── firebase.json     # Firebase Hosting config
├── .firebaserc       # Firebase project alias
└── .env.example
```

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
