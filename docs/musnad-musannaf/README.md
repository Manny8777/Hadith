# المسند المصنف المعلل — feature overview

A dedicated section of the railway hadith encyclopedia that presents the book
**المسند المصنف المعلل** (a *muʿallal* / defects musnad organized by صحابي, by
د. بشار عواد معروف وآخرون) **inside** the app, reusing railway's existing isnad,
narrator, and criticism data and components.

- **Live:** https://hadith-web-production.up.railway.app/musnad-musannaf
- **Routes:**
  - `/musnad-musannaf` — index of companions (مسند الصحابة), searchable, grouped by first letter.
  - `/musnad-musannaf/[companion]` — one companion's hadiths (paginated 12/page).
- **Nav:** added under the **عرض** menu in `app/components/NavHeader.tsx`
  (`{ href: '/musnad-musannaf', label: 'المسند المصنف المعلل', isNew: true }`).

---

## The "lens" concept (the core idea)

The book itself is plain text: for each hadith it gives a matn, an isnad context,
the author's حكم, and — crucially — a list of **takhrīj sources by number**, e.g.
«ابن ماجة» (٢٤٧٥), «الدارمي» (٢٧٧١).

Those citation **numbers are the bridge.** During extraction each book entry is
matched to a railway `hadith_toc.main_id`. That single match acts as a *lens*:
once an entry points at a `main_id`, **all of railway's data for that hadith opens
up** behind the book entry —

- its `isnad_chains`, rendered with the **same `IsnadTree` React Flow component**
  used on the normal hadith detail page (مدار / صيغ التحديث / جرح وتعديل included);
- narrator biographies (link to `/narrator/[id]`);
- the full hadith page (link to `/hadith/[main_id]`).

So a static book entry becomes a **live, interactive isnad view overlaid with the
book's own علل**. The book supplies the علل and the curation-by-صحابي; railway
supplies the chains and narrators.

### Why matching is robust

The match is not a naïve "book X number N → that exact row." Different printed
editions number hadiths differently (e.g. الدارمي ت الغمري vs ت حسين أسد differ by
an offset). Instead the extractor resolves each entry by **takhrīj group-mode**:
it looks up every cited number, finds the railway `takhrij.group_id` (the parallel-
narrations group) each one belongs to, and picks the **most common group** among
them. One bad/offset citation can't derail the match because the majority wins.
See `pipeline.md`.

---

## Data flow

```
docs/ilal/Book/musnad.db        (SQLite: 42,688 parsed pages of the printed book)
        │
        │  db/ilal_extract_all.py   ── parse pages → companions + entries
        │                              parse_entry → matn / isnad / takhrīj / علل / refs
        │                              resolve()   → group-mode match to hadith_toc.main_id
        ▼
ilal_companions · ilal_entries · ilal_takhrij · ilal_ilal · ilal_refs   (PostgreSQL)
        │            │ matched_main_id / takhrij_group_id  (the lens columns)
        │            └──────────────┐
        ▼                           ▼
app/musnad-musannaf/page.tsx    lib/isnadChains.ts → getChainsForHadith(main_id)
app/.../[companion]/page.tsx          │  reads isnad_hadiths / isnad_chains / narrator_criticism
        │                             ▼
        └────────────────────►  <IsnadTree> (existing React Flow isnad component)
```

The five `ilal_*` tables are **additive and isolated** (prefix `ilal_`, reversible).
They link *into* railway data only via foreign keys to `narrators(id)` / `books(id)`
and the soft `matched_main_id` / `takhrij_group_id` bridge columns — they never
modify the core schema.

---

## Current data stats (approximate)

These come from the extractor's own reported output (`db/ilal_extract_all.py`
prints a summary at the end). No live DB query was run for this doc, so treat them
as approximate / from the last extraction run:

- **Companions:** the full مسند, organized by صحابي.
- **Entries (hadiths):** **≈ 18.6k**.
- **Matched (have a live chain):** **≈ 73%** of entries carry a resolved
  `matched_main_id` and therefore render a live `IsnadTree`. The remaining ~27%
  are mostly آثار / mawqūf entries cited **without** a takhrīj number (no number →
  no lens) plus a few edition-numbering gaps (notably النسائي/المجتبى — see
  `editions.md`). This ratio is being improved by an ongoing citation-parser
  refinement.

To get exact current counts, re-run the extractor (it prints them) or query the
tables directly:

```sql
SELECT count(*) FROM ilal_entries;                                 -- total entries
SELECT count(*) FROM ilal_entries WHERE matched_main_id IS NOT NULL; -- with lens
SELECT count(*) FROM ilal_companions;
```

---

## Files in this doc set

| File | What it covers |
|---|---|
| `README.md` | This overview — the feature, the lens, routes, flow, stats. |
| `data-model.md` | The 5 `ilal_*` tables, every column, the lens columns, a worked example row. |
| `pipeline.md` | The extraction + group-mode matching pipeline, how to re-run it, limitations. |
| `editions.md` | The 23 source editions, KetabOnline extraction, verification, the النسائي gap. |

## Key source files (for maintainers)

| Path | Role |
|---|---|
| `db/ilal_schema.sql` | DDL for the 5 tables + lens columns. |
| `db/ilal_extract_all.py` | The full extractor + matcher (re-runnable). |
| `db/ilal_populate_sample.py` | The earlier single-companion prototype (أبيض بن حمال). |
| `lib/isnadChains.ts` | `getChainsForHadith(main_id)` → `{chains, narratorCriticism}` for `IsnadTree`. |
| `app/musnad-musannaf/page.tsx` | Index page (server component). |
| `app/musnad-musannaf/CompanionList.tsx` | Client search + group-by-letter list. |
| `app/musnad-musannaf/[companion]/page.tsx` | Companion page: matn + IsnadTree + takhrīj + علل + refs. |
| `app/components/IsnadTree.tsx` | Reused React Flow isnad component (unchanged). |
| `app/components/NavHeader.tsx` | Nav entry under عرض. |
