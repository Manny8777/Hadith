# Hadith Encyclopedia — Web App Migration Plan

## Goal
Migrate برنامج خادم الحرمين الشريفين from a Windows desktop app to a web app on Railway,
preserving 100% of the data and core functionality (browse, search, hadith detail, narrator chains).

## Architecture
```
Vercel (Next.js 15 frontend + API routes)
        ↕  DATABASE_URL
Railway (PostgreSQL 17)
        ↑
One-time extraction from local HadithDB binary format
```

## Stack
- **Frontend + API**: Next.js 15 (App Router), TypeScript, Tailwind CSS
- **Database**: PostgreSQL 17 on Railway
- **Language support**: Arabic RTL (dir="rtl"), Amiri font
- **Search**: PostgreSQL unaccented + pg_trgm for Arabic full-text search
- **Deployment**: Railway (DB + web service via nixpacks)

---

## Task Checklist

### Phase 1 — Data Extraction (local Windows machine)
- [ ] 1.1 Install MinGW C++ compiler (via winget)
- [ ] 1.2 Write extractor.cpp using Engine0200.dll CIRServer/CIRRecordset API
- [ ] 1.3 Compile extractor.exe (32-bit, links Engine0200.dll)
- [ ] 1.4 Run extractor — dump all tables to data/json/*.json
- [ ] 1.5 Verify: spot-check 10 records from Book, Asaned, BookTOC_Hadith
- [ ] 1.6 Count extracted records per table (validate completeness)

### Phase 2 — Database Setup (Railway)
- [ ] 2.1 Create PostgreSQL service on Railway project
- [ ] 2.2 Write schema.sql (tables: books, hadiths, narrators, judgments, toc)
- [ ] 2.3 Write seed.ts (reads JSON → inserts into PostgreSQL)
- [ ] 2.4 Run migration + seed (railway run node seed.ts)
- [ ] 2.5 Verify: SELECT COUNT(*) on key tables

### Phase 3 — Web App
- [ ] 3.1 npx create-next-app in railway/ folder
- [ ] 3.2 Install dependencies: pg, @types/pg, tailwindcss
- [ ] 3.3 lib/db.ts — PostgreSQL connection pool
- [ ] 3.4 API route: GET /api/books
- [ ] 3.5 API route: GET /api/books/[id]/hadiths
- [ ] 3.6 API route: GET /api/hadith/[id]
- [ ] 3.7 API route: GET /api/search?q=
- [ ] 3.8 Page: / (home + search box)
- [ ] 3.9 Page: /books (book list, Arabic titles)
- [ ] 3.10 Page: /books/[id] (hadith list for book)
- [ ] 3.11 Page: /hadith/[id] (full hadith: text + narrator chain + judgments)
- [ ] 3.12 Arabic RTL layout (html dir="rtl", Amiri font via Google Fonts)
- [ ] 3.13 Mobile responsive

### Phase 4 — Deploy & Verify
- [ ] 4.1 railway up (first deploy)
- [ ] 4.2 Check railway logs for errors
- [ ] 4.3 Open public URL in browser
- [ ] 4.4 Test: home page loads, Arabic renders correctly
- [ ] 4.5 Test: book list shows all books
- [ ] 4.6 Test: click a book → hadith list loads
- [ ] 4.7 Test: click a hadith → full text renders
- [ ] 4.8 Test: search for "البخاري" returns results
- [ ] 4.9 Test: mobile layout on narrow viewport

### Phase 5 — Advanced (post-launch)
- [ ] 5.1 Narrator (Isnad) chain tree visualization
- [ ] 5.2 Hadith judgment display (صحيح / حسن / ضعيف etc.)
- [ ] 5.3 Cross-reference links between hadiths
- [ ] 5.4 Index-based browsing (الفهارس)
- [ ] 5.5 Export/share individual hadiths

---

## Key Files
```
C:\HadithProg\railway\
├── plan.md                     ← this file
├── extract/
│   ├── extractor.cpp           ← C++ DB dumper (32-bit, uses Engine0200.dll)
│   ├── extractor.exe           ← compiled binary
│   └── data/                   ← extracted JSON output
│       ├── Book.json
│       ├── BookTOC_Hadith.json
│       ├── Asaned.json
│       └── ... (one file per table)
├── package.json
├── next.config.ts
├── tsconfig.json
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── books/
│   │   ├── page.tsx
│   │   └── [id]/page.tsx
│   ├── hadith/
│   │   └── [id]/page.tsx
│   └── api/
│       ├── books/route.ts
│       ├── books/[id]/hadiths/route.ts
│       ├── hadith/[id]/route.ts
│       └── search/route.ts
├── lib/
│   └── db.ts
├── db/
│   ├── schema.sql
│   └── seed.ts
└── railway.json
```

---

## Verification Criteria (Definition of Done)
1. All books from the original app appear in the web app (count must match)
2. Arabic text renders correctly (RTL, no mojibake)
3. Hadith text matches the original app for 3 manually verified hadiths
4. Search returns relevant results for common terms (البخاري, مسلم, حديث)
5. Page loads under 3 seconds on a standard connection
6. Railway deploy completes with 0 errors in logs
