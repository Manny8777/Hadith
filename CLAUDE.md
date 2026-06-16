# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # Start dev server at http://localhost:3000
npm run build    # Production build (standalone output)
npm run start    # Start production server
```

No lint or test scripts are configured.

## Architecture

**Islamic hadith encyclopedia** — Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, PostgreSQL via raw `pg` client (no ORM). Deployed on Railway via Docker. UI is Arabic RTL throughout (`lang="ar" dir="rtl"`).

### Key directories

- `app/api/` — 50+ API routes, all raw SQL via `lib/db.ts` connection pool
- `app/components/` — Shared components (NavHeader, IsnadTree, NarratorNetworkGraph, etc.)
- `app/[feature]/` — Page routes: `books/`, `hadith/`, `narrators/`, `topics/`, `search/`, `lexicon/`, `quran/`, etc.
- `lib/db.ts` — Single PostgreSQL pool; SSL toggled by `NODE_ENV`
- `lib/numberingContext.tsx` — Only global state: hadith numbering preference (Harfi vs Matboa), stored in localStorage

### Database

Raw SQL only — no migrations file in repo. Key tables:
- `hadith_toc` — 339,607 hadith entries with nested chapter tree (left/right values)
- `narrators` — 30,087 scholars; grades, death years, transmission counts
- `isnad_chains` / `isnad_hadiths` — narrator chain links
- `books` / `authors` — 245 collections
- `hadith_services` — 22 feature flags per hadith
- `lexicon_items`, `subject_categories`, `subject_items`, `quran_refs`, `hadith_judgments`, `narrator_criticism`

PostgreSQL custom functions `normalize_arabic()` and `normalize_hadith()` handle diacritic-insensitive search.

**Only env var required:** `DATABASE_URL` (set in Railway dashboard).

### Patterns

- **Parallel queries:** Detail pages use `Promise.all([...])` for independent SQL queries
- **Graceful fallbacks:** `.catch(() => ({ rows: [{ count: 0 }] }))` on optional queries
- **Pagination:** `page` + `limit` (capped at 100) from URL search params; offset calculated as `(page-1)*limit`
- **Server Components by default;** mark `'use client'` only when needed (NavHeader, HomeSearch, graph components)
- **No ORM, no state library** — just `pg` + React Context

### Deployment

`next.config.ts` sets `output: 'standalone'`. Dockerfile is multi-stage Node 20 Alpine. Railway health-checks `/api/books`. Start command: `node server.js` from `.next/standalone/`.
