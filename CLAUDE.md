# CLAUDE.md — Corduroy AI / Trade Compliance Hub

## Project Overview

AI-powered HTS (Harmonized Tariff Schedule) classification and document analysis for international trade compliance. Users can classify products via natural language chat, upload documents, manage product profiles, and review exceptions.

## Tech Stack

- **Vite** — build tool, dev server (`npm run dev`, port 8080)
- **TypeScript + React 18** — UI
- **React Router v6** — client-side routing
- **shadcn-ui + Radix UI** — component library (`src/components/ui/`)
- **Tailwind CSS** — utility-first styling
- **Supabase** — auth, database, edge functions
- **OpenRouter** — AI model API
- **Pinecone** — vector DB for RAG
- **TanStack Query** — data fetching/caching
- **Sentry** — error monitoring

## Key Scripts

```bash
npm run dev       # Start dev server (localhost:8080)
npm run build     # Production build
npm run lint      # ESLint
npm run preview   # Preview production build
```

## Project Structure

```
src/
├── App.tsx                    # Root: auth state machine + app shell + layout
├── main.tsx                   # Entry point
├── components/
│   ├── ui/                    # shadcn-ui components (don't modify directly)
│   ├── auth/                  # LoginForm, SignUpForm, ResetPasswordForm,
│   │                          #   NewPasswordForm, WelcomeScreen, OnboardingFlow
│   ├── Dashboard.tsx          # Main dashboard with analytics
│   ├── UnifiedClassification.tsx  # HTS classification (chat + doc upload)
│   ├── ChatPanel.tsx          # Docked AI chat sidebar
│   ├── ProductProfile.tsx     # Product profile management
│   ├── BulkUpload.tsx         # Bulk classification upload
│   ├── ExceptionReview.tsx    # Exception management
│   ├── Activity.tsx           # Activity log view
│   ├── Settings.tsx           # User/org settings
│   └── IdleTimeoutWarning.tsx # Idle session warning modal
├── lib/
│   ├── supabase.ts            # Supabase client init
│   ├── supabaseFunctions.ts   # Edge function callers
│   ├── classificationService.ts  # HTS classification API calls
│   ├── dashboardService.ts    # Dashboard data queries
│   ├── sessionService.ts      # Session upsert/heartbeat/removal
│   ├── activityLogger.ts      # Activity event logging
│   ├── userService.ts         # User metadata CRUD
│   └── sentry.ts              # Sentry user tracking
├── hooks/
│   └── useIdleTimeout.ts      # Idle timeout + warning hook
└── contexts/                  # React contexts (if any)

supabase/
├── migrations/                # SQL migration files
├── edge-function-python-proxy.ts
└── python-dev-edge-function.ts
```

## App Views & Navigation

`App.tsx` manages a `View` state for single-page navigation (no URL routing for main views):

| View | Component | Description |
|------|-----------|-------------|
| `dashboard` | `Dashboard` | Analytics overview |
| `classify` | `UnifiedClassification` | HTS classification (chat/doc) |
| `profile` | `ProductProfile` | Product profile management |
| `settings` | `Settings` | User/org settings |
| `activity` | `Activity` | Activity log |

## Auth Flow

Supabase auth with `onAuthStateChange` listener. Handled in `App.tsx`:

1. **Login** → `LoginForm` → `handleLogin` → `loadUserData`
2. **Signup** → `SignUpForm` → `handleSignUp` → `createOrUpdateUserMetadata` → `loadUserData`
3. **Password Reset** — PKCE flow, hash-based recovery token
4. **Session check** — `checkSession()` on mount; `skipAutoLogin` flag in `sessionStorage` prevents auto-login after explicit logout
5. **Idle timeout** — 15 min inactivity triggers logout, with 2 min warning (`useIdleTimeout`)
6. **Session heartbeat** — pings every 2 min via `heartbeat(userId)`
7. **Token refresh failure** → clears user state, shows session-expired banner

## Supabase Tables (key)

- `user_metadata` — profile info, company, confidence threshold, onboarding status
- `login_history` — login events per user
- `sessions` — active session tracking
- `activity_log` — user activity events
- `classifications` — HTS classification results (supports bulk)

## Environment Variables

Required in `.env`:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_OPENROUTER_API_KEY=
```

## Git & Development Branch

- **Active branch**: `claude/review-code-memory-LdqOM`
- Always push to: `git push -u origin claude/review-code-memory-LdqOM`
- Branch must start with `claude/` — pushing to other branches will fail (403)
- Retry push up to 4x on network failure with exponential backoff (2s, 4s, 8s, 16s)

## Conventions

- Components are functional React with TypeScript
- `src/components/ui/` — shadcn-ui primitives, do not modify unless adding new shadcn components
- Services in `src/lib/` are plain async functions (not classes)
- Tailwind for all styling; no CSS modules
- Use `sonner` (via `src/components/ui/sonner.tsx`) for toast notifications
- Sentry is initialized in `src/lib/sentry.ts` — call `setSentryUser` on login/logout
- Activity logging: call `logActivity(userId, event, metadata?)` for significant user actions

## Deployment

- **Platform**: Vercel
- Build: `npm run build` → outputs `dist/`
- `vercel.json` configured with SPA rewrite rules (all routes → `index.html`)
