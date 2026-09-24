# Post-backup roadmap

**Project:** Hadith Encyclopedia web application
**Status:** Backups/monitoring completed (step 1)
**Starting point:** the application is deployed at [the live site](https://hadith-web-production.up.railway.app).

This document covers the remaining work:

1. Fresh full data audit
2. Automated regression tests
3. Performance optimization
4. User-experience improvements

Do these in order. Each phase has an exit condition before starting the next one.

## Non-negotiable guardrails

- Treat the legacy application and data as read-only.
- Never invent a legacy relationship to make a count look complete.
- Take a Railway PostgreSQL snapshot before any destructive or bulk data operation.
- Keep the production pool small: one web replica, `DB_POOL_MIN=0`, and the current capped pool.
- Run `npm.cmd run verify:parity` after any database or service-type change.
- Do not commit `.env`, `DATABASE_URL`, Railway tokens, or PostgreSQL credentials.
- Prefer an additive, idempotent migration over a one-off production edit.

---

## 2. Fresh full data audit

### Objective

Recheck the current database against the legacy source, focusing on meaningful differences rather than raw row-count noise.

### Scope

Audit these areas separately:

- Hadith and book counts
- Service-content and service-link counts
- Narrator biographies, grading, criticism, and teacher/student relations
- Takhrij groups and memberships
- Matn comparisons
- Lexicon references
- Topic and subject links
- Quran references
- Controversy/mokhtalat trees
- Dangling foreign-key-like references
- Duplicate keys and duplicate source rows

The historical baseline is in [07-data-count-parity.md](../legacy-audit/07-data-count-parity.md). The current operational checks are in [production-operations.md](production-operations.md).

### Method

1. Record the exact source revision and the exact web commit.
2. Run read-only table counts and distinct-key counts.
3. Classify every difference as one of:
   - exact parity
   - duplicate collapse
   - intentional source sentinel/dangling reference
   - missing valid data
   - genuine application defect
   - unknown — do not load
4. For every missing valid row, document the source table, key, expected destination, and a reproducible loader/query.
5. Run the smallest transaction possible.
6. Repeat the same verification after the transaction.

### Existing checks to run

```powershell
npm.cmd run verify:parity
node db/verify_matn_comparison_hadith.js
node db/repair_service_types.js --check
```

For the independent legacy matn classification, run the bundled audit reader when the legacy data is available:

```powershell
legacy-audit/harness/.cmpvenv/Scripts/python.exe db/audit_matn_pair_gap.py
```

### Audit deliverable

Create a dated report containing:

- source table and web table
- raw rows
- distinct keys
- duplicate rows
- missing valid keys
- extra web keys
- classification/reason
- repair status
- verification query

Save reports under `db-backup/` or another ignored local audit directory. Do not commit large exports.

### Exit criteria

- Every difference has a classification.
- No unknown mismatch is being hidden by a raw count.
- Any new repair has a rollback path and a before/after verification query.
- The report is reviewed before a production write.

---

## 3. Automated regression tests

### Objective

Prevent the service-type, matn-key, Arabic-label, and production-route regressions that were found manually.

### Test layers

#### A. Route smoke tests

Keep the existing dependency-free smoke runner in [production-smoke.mjs](../scripts/smoke/production-smoke.mjs). Extend it with a small route matrix:

| Surface | Representative checks |
|---|---|
| Health | `/api/health` returns 200 and database `reachable` |
| Search | Arabic query, grade/filter state, no server error |
| Hadith | matn, sanad, numbering, takhrij, service content |
| Takhrij | group, across-books, witnesses, spread pagination |
| Narrator | biography, teachers/students, relations, statistics |
| Topics | branch children and direct-hadith view |
| Services | canonical names, `TypeID 15`, source-only type copy |
| Quran | sura/aya anchors and service-content links |
| Arabic UI | required RTL labels and no raw service tags |

#### B. API contract checks

For each public API used by the UI, record a small JSON fixture or invariant:

- required keys exist
- IDs are numeric where expected
- counts are non-negative integers
- Arabic names are not `null` when a source lookup exists
- pagination is bounded
- empty results return a successful response rather than 500

Start with:

- `/api/hadith/[id]`
- `/api/hadith/[id]/services`
- `/api/hadith/[id]/commentary`
- `/api/topics/item/[id]`
- `/api/narrator/[id]`
- `/api/search`
- `/api/health`

#### C. Browser tests

Use Playwright for a small number of user journeys:

1. Search from the homepage.
2. Open a hadith and inspect sanad/matn.
3. Open takhrij and switch between group members.
4. Open a narrator and verify teacher/student relations.
5. Switch a topic branch between children and direct hadiths.
6. Open a service-content page and follow a Quran/narrator link.
7. Use Arabic browser back/forward behavior with URL filters.

Check for console errors, failed requests, broken Arabic labels, and mobile viewport overflow.

#### D. Migration tests

Every database repair should have:

- a dry-run/check mode
- an idempotent apply mode
- a rollback or documented recovery procedure
- a test against a disposable database or fixture

### Exit criteria

- The full route matrix runs in CI or before every deployment.
- A failed check blocks the deployment.
- Browser tests cover desktop and mobile.
- API fixtures are versioned with the schema.
- The smoke command works without credentials beyond the test environment's normal database access.

---

## 4. Performance optimization

### Objective

Improve latency and database load without increasing Railway resources unnecessarily.

### Baseline first

Measure before changing indexes or queries:

- health endpoint p50/p95
- search p50/p95
- hadith detail p50/p95
- narrator detail p50/p95
- takhrij search and spread
- service index
- topic branch views

Record query duration, response size, database time, and cache behavior. Use the current [production smoke script](../scripts/smoke/production-smoke.mjs) as a repeatable baseline, not as a substitute for real-user metrics.

### Query review order

1. Health and small APIs
2. Search
3. Hadith detail
4. Narrator detail
5. Takhrij and matn comparison
6. Service index and large aggregates
7. Topic and export pages

For expensive queries, use:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT ...;
```

Do not add an index based only on intuition. Record the query it fixes, its write cost, and the before/after plan.

### Candidate areas

- `hadith_service_links(type_id)`
- matn master/slave/label indexes
- takhrij group membership indexes
- narrator teacher/student indexes
- topic direct-hadith indexes
- search normalization/expression indexes where PostgreSQL supports them
- covering indexes only when they reduce measured index/heap work

### Memory-safe large reports

The takhrij spread report already uses bounded aggregate settings. Preserve that pattern for any other large grouped report:

- cap page-sized source rows
- avoid unbounded `STRING_AGG`
- use per-group lateral limits
- set a bounded local `work_mem`
- disable unnecessary parallel workers for reports that exhaust shared memory

### Exit criteria

- A performance baseline exists.
- The slowest critical routes have measured plans.
- Every new index has a documented reason and maintenance cost.
- No route regresses while solving another route.
- Railway usage and latency are compared before/after.

---

## 5. User-experience improvements

### Priority order

#### P0 — useful immediately

- Print-friendly hadith view
- Export/share a hadith URL with current filters
- Preserve search and topic filters in the URL
- Consistent Arabic-Indic numeral preference across hadith, narrator, Quran, and comparison pages
- Clear empty/error states for no takhrij, no service content, or no direct hadiths
- Mobile navigation and RTL table/card layouts

#### P1 — high-value workflow

- Saved searches and bookmarks
- Recent searches
- Copy-to-clipboard Arabic text
- “Jump to matn comparison” from every hadith
- Related-hadith navigation based on the corrected matn graph
- Download/print for narrator and topic reports

#### P2 — larger product work

- User accounts and private annotations
- Saved comparison sets
- Citation/export formats
- Personalized reading history
- Public API documentation

### UX acceptance criteria

For every new feature:

- works with Arabic RTL layout
- works on a narrow mobile viewport
- has an empty state
- has a loading state
- has an error state
- has keyboard-accessible navigation
- preserves filters in the URL where appropriate
- does not fetch the full database table into the browser

### Exit criteria

Choose one P0 item and one P1 item, implement them behind the existing navigation, and add a browser test for each. Avoid starting user accounts until the public workflow is stable.

---

## Suggested execution order

### Week/sprint 1 — audit and tests

- [ ] Produce the fresh data-audit report.
- [ ] Classify all remaining differences.
- [ ] Add API contract checks.
- [ ] Add the Playwright route journeys.
- [ ] Add migration dry-run/rollback tests.

### Sprint 2 — performance

- [ ] Capture route latency baselines.
- [ ] Profile search, hadith, narrator, and takhrij.
- [ ] Add only measured indexes/query improvements.
- [ ] Re-run parity and smoke tests after each change.

### Sprint 3 — UX P0

- [ ] Print/share hadith view.
- [ ] URL-preserved filters.
- [ ] Consistent numeral preference.
- [ ] Mobile RTL layout pass.

### Sprint 4 — UX P1

- [ ] Saved searches/bookmarks.
- [ ] Matn comparison quick navigation.
- [ ] Arabic text export/copy.
- [ ] Narrator/topic report export.

## Definition of done for this roadmap

- The data-audit report has no unexplained mismatch.
- Automated route, API, browser, and migration checks exist.
- Performance changes have before/after measurements.
- The first P0 and P1 UX improvements are deployed and smoke-tested.
- The live health endpoint remains green after every release.
- The repository and [production operations runbook](production-operations.md) describe the final procedure.

---

## Overnight execution record (2026-09-25)

The release-gate portion of this roadmap was completed against the current tree:

- source-fingerprinted read-only audit: 29/29 queries passed, no genuine application defect;
- API contracts: 19/19 against the local server;
- representative route smoke: 18/18;
- URL-state, topic-export, report-export, audit, search, performance-baseline, typecheck, and build checks passed;
- desktop and 390px RTL browser journeys passed with zero console errors;
- service-search ranking was reduced from roughly 16.5–17.1 seconds to roughly 0.91–0.95 seconds locally, and hadith search from roughly 3.5–4.6 seconds to roughly 0.59–1.38 seconds.

The four semantic-review unknowns named in the handoff remain intentionally fail-closed: narrator biography provenance, narrator criticism lineage, Quran reader/ayat namespaces, and controversy-description namespaces. They are not release blockers and must not be resolved by guessing lineage or fabricating mappings. The final commit, Railway deployment identifier, and post-deploy smoke results are recorded in [work-handoff.md](work-handoff.md).
