# ZoneIn

A focus session calendar app. Book, start, and track deep work sessions — with AI-powered scheduling, tags, stats, and an inbox.

![ZoneIn](https://img.shields.io/badge/status-live-brightgreen) ![React](https://img.shields.io/badge/frontend-React%20%2B%20Vite-61dafb) ![Flask](https://img.shields.io/badge/backend-Flask-lightgrey) ![Supabase](https://img.shields.io/badge/database-Supabase-3ecf8e)

## Features

- **Calendar view** — 3-day grid (desktop) / 1-day (mobile) with 5-min time slots
- **Session booking** — click a slot to book, or use the AI bar
- **AI scheduling** — type in plain English ("study for 2 hours tomorrow morning") and Gemini schedules it
- **Timer** — start/complete sessions with a live countdown in the tab title
- **Break overlay** — optional auto-start break timer after each session
- **Stats** — daily, weekly, monthly, yearly, and lifetime focus stats with a bar chart
- **Tags** — color-coded tags to categorize sessions
- **Inbox** — capture tasks and schedule them directly to the calendar
- **Settings** — auto-start sessions/breaks, default duration, avatar initial
- **Auth** — email/password and Google OAuth via Supabase

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React + Vite |
| Backend | Python Flask |
| Database | Supabase (PostgreSQL + RLS) |
| AI | Google Gemini 2.5 Flash Lite via LangChain |
| Frontend hosting | Vercel |
| Backend hosting | Fly.io |

## Project Structure

```
zonein/
├── src/                    # React frontend
│   ├── components/
│   │   ├── auth/           # LoginScreen
│   │   ├── calendar/       # CalendarView, BottomBar, SessionModal
│   │   ├── inbox/          # InboxView, SchedulePicker
│   │   ├── settings/       # SettingsView
│   │   ├── shared/         # NavBar, Toast, NotifPopup
│   │   ├── stats/          # StatsView
│   │   ├── tags/           # TagsView
│   │   └── timer/          # BreakOverlay
│   ├── hooks/              # useAuth, useData, useTimer, useToast
│   ├── lib/                # supabase.js, constants.js, utils.js
│   └── styles/             # variables.css, base.css, components.css
├── index.html
├── vite.config.js
├── package.json
├── vercel.json             # Vercel deployment config
└── backend/                # Flask API
    ├── app.py
    ├── requirements.txt
    ├── Dockerfile
    ├── fly.toml            # Fly.io deployment config
    └── supabase-schema.sql
```

## Getting Started

### Frontend

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`

### Backend

```bash
cd backend
pip install -r requirements.txt
```

Set environment variables:

```bash
export SUPABASE_URL=your_supabase_url
export SUPABASE_SERVICE_KEY=your_service_key
export GEMINI_API_KEY=your_gemini_key
```

Run locally:

```bash
python app.py
```

## Database Setup

Run `backend/supabase-schema.sql` in your Supabase SQL editor to create the `sessions`, `tags`, and `settings` tables with Row Level Security policies.

## Deployment

**Frontend (Vercel)** — auto-deploys on push to `main`. Vercel runs `npm install && npm run build` and serves the `dist/` folder.

**Backend (Fly.io):**

```bash
cd backend
fly deploy
```

Required Fly.io secrets:

```bash
fly secrets set SUPABASE_URL=... SUPABASE_SERVICE_KEY=... GEMINI_API_KEY=...
```
