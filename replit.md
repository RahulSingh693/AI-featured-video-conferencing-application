# Synapse Meet — Smart AI Video Conferencing

## Overview

A full-stack AI-powered video conferencing web application built as a pnpm workspace monorepo.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (artifacts/meet-app), Tailwind CSS, shadcn/ui components
- **Backend**: Express 5 (artifacts/api-server)
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod, drizzle-zod
- **API codegen**: Orval (from OpenAPI spec in lib/api-spec)
- **Charts**: Recharts
- **Auth**: express-session + bcryptjs (session-based)

## Features

- Session-based auth (register/login/logout)
- Meeting creation, joining by code, ending
- Real-time video conferencing UI (WebRTC getUserMedia for camera)
- AI attention tracking — records score every 30 seconds, shows live progress bar
- Participant management with join/leave times and attention scores
- Dashboard with analytics charts (weekly activity, monthly meetings, attention trend)
- Meeting summaries with AI-generated key points and action items
- Meetings list with search and status filtering

## Routes

### Frontend (meet-app at /)
- `/` — Landing page
- `/login` — Login page with demo credentials shown
- `/register` — Registration page
- `/dashboard` — Analytics dashboard with recharts charts
- `/meetings` — Meeting list with search/filter
- `/meetings/new` — Create or join a meeting by code
- `/meetings/:id` — Meeting room (camera + attention tracking)
- `/meetings/:id/summary` — Post-meeting AI summary

### API (api-server at /api)
- `POST /api/auth/register|login|logout`
- `GET /api/auth/me`
- `GET|POST /api/meetings`
- `POST /api/meetings/join-by-code`
- `GET|POST /api/meetings/:id` (join, end, summary, participants, attention)
- `GET /api/dashboard/stats|analytics|recent-meetings`

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Demo Users

- **rahul@example.com** / password123 (user ID: 1)
- **nishanta@example.com** / password123 (user ID: 2)

## Workspace Structure

```
artifacts/
  api-server/       — Express 5 backend
  meet-app/         — React + Vite frontend
lib/
  api-spec/         — OpenAPI spec + Orval codegen config
  api-client-react/ — Generated React Query hooks
  api-zod/          — Generated Zod schemas
  db/               — Drizzle ORM schema + migrations
```

## Environment Secrets

- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — Express session secret
