# Hadith Encyclopedia — Web App Migration Plan

## Goal
Migrate برنامج خادم الحرمين الشريفين from a Windows desktop app to a web app on Railway,
preserving 100% of the data and core functionality (browse, search, hadith detail, narrator chains).

## Architecture
```
Railway (Next.js 16 frontend + API routes)  ← hadith-web service
        ↕  DATABASE_URL (internal railway network)
Railway (PostgreSQL — "Postgres" service)
        ↑
One-time extraction from local HadithDB binary format using Engine0200.dll
```

## Stack
- **Frontend + API**: Next.js 16 (App Router), TypeScript, Tailwind CSS 4
- **Database**: PostgreSQL on Railway
- **Language support**: Arabic RTL (dir="rtl"), Amiri font via Google Fonts
- **Search**: PostgreSQL `plainto_tsquery('simple', ...)` full-text search
- **Deployment**: Railway (DB + web service via Dockerfile builder)
- **Live URL**: https://hadith-web-production.up.railway.app

---

## Task Checklist

### Phase 1 — Data Extraction (local Windows machine)
- [x] 1.1 Install 32-bit LLVM-MinGW compiler (i686-w64-mingw32-clang++)
- [x] 1.2 Write extractor.cpp using Engine0200.dll CIRServer/CIRRecordset API
- [x] 1.3 Compile extractor.exe (32-bit, must run from C:\HadithProg)
- [x] 1.4 Run extractor — dumped all 31 tables to extract/data/*.json
- [x] 1.5 Post-process: rename f0/f1/f2 fields using Catalog.xml → extract/data_named/
- [x] 1.6 Count extracted records — 339,607 hadith TOC rows, all tables complete

### Phase 2 — Database Setup (Railway)
- [x] 2.1 PostgreSQL service provisioned on Railway (HadithProg project)
- [x] 2.2 schema.sql — 7 tables: books, authors, narrators, isnad_chains, isnad_hadiths, hadith_judgments, hadith_toc
- [x] 2.3 seed.py — Python/psycopg2 with ijson streaming for 989 MB BookTOC_Hadith.json
- [x] 2.4 Seeded all tables (streaming via ijson for large files)
- [x] 2.5 Verified row counts: books 245, narrators 30,087, isnad_chains 250,279, hadith_toc 339,607

### Phase 3 — Web App
- [x] 3.1 Next.js 16 app created in railway/ folder
- [x] 3.2 Dependencies: pg, @types/pg, tailwindcss 4, typescript
- [x] 3.3 lib/db.ts — PostgreSQL connection pool (ssl-aware)
- [x] 3.4 API route: GET /api/books — 245 books with author join
- [x] 3.5 API route: GET /api/books/[id]/hadiths — full TOC for a book
- [x] 3.6 API route: GET /api/hadith/[id] — hadith + judgments + isnad (parallel queries)
- [x] 3.7 API route: GET /api/search?q= — plainto_tsquery full-text, paginated
- [x] 3.8 Page: / (home + Arabic search box)
- [x] 3.9 Page: /books (all 245 books listed)
- [x] 3.10 Page: /books/[id] (TOC chapters + first 50 hadiths)
- [x] 3.11 Page: /hadith/[id] (full text, narrator chain, scholars' judgments, prev/next)
- [x] 3.12 Arabic RTL layout (lang="ar" dir="rtl", Amiri font)
- [ ] 3.13 Mobile responsive — basic Tailwind classes applied, not explicitly tested

### Phase 4 — Deploy & Verify
- [x] 4.1 Deployed via Dockerfile builder (railway up) — hadith-web service
- [x] 4.2 Build logs reviewed — 4 iterations to fix TypeScript + pre-render issues
- [x] 4.3 Public URL live: https://hadith-web-production.up.railway.app
- [x] 4.4 Home page loads, Arabic renders correctly (Amiri font, RTL)
- [x] 4.5 Book list shows all 245 books
- [x] 4.6 Book 1 (صحيح البخاري) → 11,555 TOC entries load
- [x] 4.7 Hadith detail renders full text + narrator chain + judgments
- [x] 4.8 Search: 3,716 results for "قال", full Arabic results confirmed
- [ ] 4.9 Mobile layout — pending manual browser test

### Phase 5 — Takhrij / Cross-references (HTakhreeg — 281,541 rows)
- [ ] 5.1 Add `takhrij` table to schema (hadith_id, group_id, compound_matn_id, book_id)
- [ ] 5.2 Seed HTakhreeg.json → takhrij table
- [ ] 5.3 API: GET /api/hadith/[id]/takhrij → all hadiths sharing same group_id
- [ ] 5.4 Component: TakhrijSection.tsx — "هذا الحديث في كتب أخرى"
- [ ] 5.5 Wire TakhrijSection into /hadith/[id] page

### Phase 6 — Narrator Detail Pages (NounsGarh, NounsBooks, NounsRelations — 140k rows)
- [ ] 6.1 Add schema: narrator_grading (NounsGarh), narrator_books (NounsBooks), narrator_relations (NounsRelations + NounsRelationsTypes)
- [ ] 6.2 Seed NounsGarh, NounsBooks, NounsRelations, NounsRelationsTypes, NounsScientists
- [ ] 6.3 API: GET /api/narrator/[id] → biography + grading + books + teacher/student links
- [ ] 6.4 Page: /narrator/[id] — full narrator profile
- [ ] 6.5 Update hadith isnad display to make narrator names clickable → /narrator/[id]

### Phase 7 — Subject Index / الفهارس (Index — 9 rows, IndexItem — 25,922 rows)
- [ ] 7.1 Add schema: subject_categories (Index), subject_items (IndexItem)
- [ ] 7.2 Seed Index.json and IndexItem.json
- [ ] 7.3 API: GET /api/topics — all categories with counts
- [ ] 7.4 API: GET /api/topics/[id] — items in a category (paginated)
- [ ] 7.5 Page: /topics — topic category browser
- [ ] 7.6 Page: /topics/[id] — hadiths under a topic (links to /hadith/[id])

### Phase 8 — Hadith Service Flags (HadithServicesState — 277,396 rows)
- [ ] 8.1 Add `hadith_services` table (22 boolean feature flags per hadith)
- [ ] 8.2 Seed HadithServicesState.json
- [ ] 8.3 API: GET /api/hadith/[id]/services → feature flags object
- [ ] 8.4 Component: ServicesBadges.tsx — icon badges (تخريج، شرح، موضوعات، غريب…)
- [ ] 8.5 Wire into /hadith/[id] page header

### Phase 9 — Arabic Lexicon / غريب الحديث (LexiconItems — 13,399 rows)
- [ ] 9.1 Add schema: lexicon_categories (Lexicon), lexicon_items (LexiconItems), lexicon_descrp (LexiconDescrp)
- [ ] 9.2 Seed Lexicon.json, LexiconItems.json, LexiconDescrp.json
- [ ] 9.3 API: GET /api/lexicon?q= — search lexicon by term
- [ ] 9.4 API: GET /api/lexicon/[id] — lexicon entry with linked hadiths
- [ ] 9.5 Page: /lexicon — Arabic lexicon browser with search

### Phase 10 — Full Isnad Tree (AsanedTree — 797,473 rows)
- [ ] 10.1 Add schema: isnad_tree (hierarchical tree of narrator paths, nested set model)
- [ ] 10.2 Seed AsanedTree.json (large — use ijson streaming)
- [ ] 10.3 API: GET /api/hadith/[id]/isnad-tree — tree nodes for a hadith
- [ ] 10.4 Component: IsnadTree.tsx — visual collapsible tree
- [ ] 10.5 Wire into /hadith/[id] page

### Phase 11 — Search Improvements
- [ ] 11.1 Filter by book (add ?book_id= param to /api/search)
- [ ] 11.2 Filter by narrator name (join narrators table)
- [ ] 11.3 Filter by hadith degree/grading
- [ ] 11.4 Update /search page with filter UI (dropdowns for book, narrator)
- [ ] 11.5 Narrator search: /api/search/narrators?q=

### Phase 12 — UI Polish & Navigation
- [ ] 12.1 Add nav links for /topics, /lexicon, /narrators to layout.tsx
- [ ] 12.2 Home page stats (245 كتاب، 339,607 حديث، 30,087 راوٍ)
- [ ] 12.3 Mobile layout test and fixes
- [ ] 12.4 Loading skeletons / suspense boundaries
- [ ] 12.5 Export/share individual hadiths (copy button, print view)

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
