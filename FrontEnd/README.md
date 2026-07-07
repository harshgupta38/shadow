# FrontEnd - Shadow Web Client

This file is a frontend-focused companion.
The canonical project source of truth is the root README at ../README.md.

---

## 1) Purpose

FrontEnd is the React SPA used by users to access Shadow features:

- auth and onboarding
- dashboard and daily planning
- goals and milestones
- metrics tracking and reports
- assistant chat, journal, notifications
- profile, memory center, and settings

The frontend communicates with the backend through typed API modules.

---

## 2) Stack

- React 18
- TypeScript
- Vite
- Bootstrap 5 + React-Bootstrap
- React Router
- Axios
- Vitest + React Testing Library
- Firebase Hosting

---

## 3) Quick Start

```powershell
cd FrontEnd
npm install
Copy-Item .env.example .env
npm run dev
```

Default local URL:

- http://localhost:5173

---

## 4) Scripts

```powershell
npm run dev
npm run build
npm run build:prod
npm run preview
npm run lint
npm run test
npm run test:watch
npm run test:coverage
npm run deploy
```

---

## 5) Environment

```env
VITE_API_BASE_URL=http://localhost:8000/api
```

Only VITE_ variables are exposed in the browser. Do not put secrets here.

---

## 6) Route Map

Defined in src/App.tsx.

Public:

- /login
- /register

Authenticated (pre-onboarding):

- /onboarding

Authenticated + onboarded app shell:

- /
- /plan
- /schedule
- /goals
- /goals/:goalId
- /repetitive-tasks
- /track
- /reports
- /assistant
- /journal
- /notifications
- /profile
- /memory-center
- /settings

Fallback:

- * (NotFound)

---

## 7) Architecture Notes

- API calls go through src/api/client.ts and typed modules in src/api/.
- Auth token storage key is shadow.token.
- Theme storage key is shadow.theme.
- Unauthorized responses emit shadow:unauthorized and auth context logs out.
- Providers are composed in src/context/AppProviders.tsx.
- Theme is applied with data-bs-theme on document root.

---

## 8) Current UX Notes

- Plan page now supports AI generation via `Generate Today's Plan`, workspace insights, and suggested execution order/scheduling alongside manual task CRUD.
- Today page now includes `Plan +` CTA beside generation; users can open an Automatic/Manual modal to schedule future tasks.
- New `/schedule` page lists future planned tasks with edit/delete/reschedule actions.
- Repetitive Tasks page (`/repetitive-tasks`) is API-backed with persisted CRUD, lifecycle actions, and recommendation endpoints.
- AI-first Today workspace redesign (SCRUM-11) is now partially implemented on `/plan` with backend-driven workspace and generation endpoints.
- Settings page enforces Gemini-only model selection via dropdown.
- Memory center uses refine-then-save flow with re-refine on large edits.

---

## 9) File Layout

```text
FrontEnd/
|- src/
|  |- App.tsx
|  |- main.tsx
|  |- api/
|  |- components/
|  |- context/
|  |- hooks/
|  |- lib/
|  |- pages/
|  |- styles/theme.css
|  |- test/setup.ts
|- index.html
|- package.json
|- vite.config.ts
|- tsconfig*.json
|- firebase.json
|- .firebaserc
|- .env.example
```

---

## 10) Testing

Run frontend tests:

```powershell
cd FrontEnd
npm run test
```

Repository test snapshot:

- 11 frontend test files
- 50 test cases

Build check:

```powershell
npm run build
```

---

## 11) Deployment

Build and deploy:

```powershell
npm run deploy
```

firebase.json is configured for SPA rewrites to /index.html and long-lived cache headers for static assets.

Backend must allow deployed frontend origins in CORS_ORIGINS.
