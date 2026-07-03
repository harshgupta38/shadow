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
- /goals
- /goals/:goalId
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

- Plan page currently uses a task CRUD workflow with date navigation.
- AI-first Today workspace redesign exists as product story (SCRUM-11) and is in progress.
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

- 6 frontend test files
- 27 test cases

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
