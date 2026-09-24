# Overnight work handoff

**Execution window:** 2026-09-24/25
**Repository:** `C:\Users\Shipping-Nada\Desktop\Hadith`
**Branch:** `master`
**Starting HEAD:** `3355361e6aa82092cb36576eb8d941a30f58fff5`
**Legacy source:** read-only; no legacy files were modified.

## Completion status

The current tree has passed the local release gate, the source-fingerprinted read-only audit, live-local API contracts, route smoke tests, and desktop/mobile RTL browser journeys. No current-tree test, build, browser-console, or contract blocker remains.

The only intentionally unresolved audit classifications are semantic-review unknowns. They are documented below and are not safe to convert into fabricated data or production writes. The previously reported narrator-relation “genuine defect” was resolved as a source-namespace fact: 17 positive `NounsRelations.SecondRawyID` values are `NounsScientistsSays.ID` values in a separate namespace, not missing narrator IDs.

## Work completed

### Search and performance

- Hardened `app/api/search/route.ts` with strict integer parsing, bounded pagination, safe empty responses, Boolean/Arabic connective grammar, wildcards, narrator/text modes, service-catalogue search, and exact totals.
- Search matching still uses the normalized tarf/content GIN predicates. Ranking now uses the short indexed tarf document rather than reconstructing full tarf+content documents for every matching row.
- The ranking change preserves result membership and totals while reducing measured local page latency:
  - service search: approximately 16.5–17.1 seconds before, 0.91–0.95 seconds after;
  - hadith search: approximately 3.5–4.6 seconds before, 0.59–1.38 seconds after.
- `scripts/performance/search-route.mjs` now guards the bounded ranking boundary and refuses non-local HTTP benchmarks.

### URL state, topic UX, and reports

- `lib/urlState.ts`, `app/search/page.tsx`, `app/components/SearchSubHeader.tsx`, and `app/components/TopicSearchForm.tsx` provide defensive, shareable URL state, pagination resets, preserved filters, and browser history support.
- `app/topics/item/[id]/page.tsx` distinguishes child topics from direct hadiths and supports bounded search/grade/pagination views.
- Topic and narrator copy, TXT download, and print flows validate bounded responses and state when an export is incomplete. Shared print/download behavior is in `app/components/ReportPrintButton.tsx`, `lib/downloadTextFile.ts`, `app/layout.tsx`, and `app/globals.css`.

### Read-only audit framework

- `db/audit_data_readonly.js` is SELECT-only, read-only transaction guarded, timeout/work-memory bounded, secret-redacted, rollback checked, and fail-closed on invalid manifest evidence.
- `db/audit_legacy_evidence.py` fingerprints the local Harf source and writes only ignored evidence under `db-backup/`. Its Windows path-stat safety checks were repaired.
- `db/audit_manifest.json` records 29 mapping contracts, duplicate-collapse decisions, the sparse service-type lookup, and four deliberately retained semantic-review areas.
- `tests/audit/audit-self-check.mjs` validates the manifest, source-unavailable safety, namespace invariant, redaction, and read-only SQL guard.

## Validation results

All commands below were run against the current working tree unless explicitly marked as a pre-change baseline.

- `npm.cmd run typecheck` — PASS.
- `npm.cmd run build` — PASS; Next.js `16.3.6`, optimized production build completed.
- `npm.cmd run test:url-state` — PASS, 9/9.
- `npm.cmd run test:contracts` with `BASE_URL=http://127.0.0.1:3000` — PASS, 19/19, no skipped tests.
- `npm.cmd run smoke -- http://127.0.0.1:3000` — PASS, 18/18 representative routes.
- `npm.cmd run verify:parity` — PASS; matn valid pairs remain 7,820,313 and sparse service lookup remains valid.
- `npm.cmd run check:audit` — PASS, 29 mappings, four required unknowns.
- `node --check db/audit_data_readonly.js` and Python evidence-generator compile — PASS.
- `node scripts/performance/search-route.mjs` — static query/safety checks PASS; local HTTP benchmark is recorded above.
- `node scripts/performance/route-baseline.mjs` — representative local routes all returned HTTP 200; the latest slow-route baseline was captured before the ranking optimization, so the search benchmark above is the post-change performance record.
- `git diff --check` — PASS; Git emitted only Windows LF/CRLF notices.
- Desktop/mobile browser pass:
  - search result rendering, empty/degenerate state, Boolean scope URL/history, and query changes;
  - topic child/direct-hadith navigation and pagination;
  - topic and narrator copy/TXT/print controls;
  - semantic service content and Quran references;
  - narrow 390px RTL viewport had `scrollWidth == innerWidth` and no console errors.

## Source-fingerprinted audit

Command used:

```powershell
legacy-audit/harness/.cmpvenv/Scripts/python.exe db/audit_legacy_evidence.py --output db-backup/source-audit-evidence-2026-09-25.json
npm.cmd run audit:readonly -- --source-evidence db-backup/source-audit-evidence-2026-09-25.json --statement-timeout-ms 120000 --work-mem-mb 32
```

- Catalog SHA-256: `9549231fa3984eae23499dfaa9177cb6f710b1e7ccf0f078bbf8aafb757951d4`.
- Latest report: `db-backup/audits/2026-09-24T15-23-55-843Z/data-audit.json` and its Markdown companion.
- Result: `completed_with_unknowns`, exit 0, 29/29 queries passed, read-only guard PASS, rollback PASS.
- Classifications: 25 `unknown`, 1 `exact_parity`, 2 `duplicate_collapse`, 1 `intentional_source_sentinel_or_dangling_reference`.
- No query failures and no genuine application defect remain.
- The four named semantic-review unknowns are narrator biography provenance, narrator criticism lineage, Quran reader/ayat namespaces, and controversy-description namespaces. The other unknowns are source-set comparisons that remain intentionally fail-closed rather than being upgraded to parity.

## Data and safety decisions

- The 238 matn pairs previously reported as unresolved are invalid legacy placeholder/corrupt keys, not valid missing comparisons. No invalid matn rows were inserted.
- Service type `15=شبهات` remains a canonical source-only service with `column_key = NULL`; no fabricated `shubah` mapping was added.
- No production database write, migration, repair, or legacy source mutation was performed during this overnight execution.
- Generated evidence and audit reports remain under ignored `db-backup/` and must not be committed.
- Do not commit `.env`, `DATABASE_URL`, Railway tokens, or database credentials.

## Release boundary

- Code-level and current-local validation are complete.
- The dirty tree must be reviewed and committed as one intentional release, then pushed to Railway.
- After Railway reports a successful deployment, run the production smoke matrix, API contracts, search baseline, health check, and a browser smoke pass against the live URL.
- Do not perform load testing against production.

## Resume commands

```powershell
git status --short
git diff --check
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:url-state
npm.cmd run test:contracts
npm.cmd run smoke -- http://127.0.0.1:3000
npm.cmd run verify:parity
npm.cmd run check:audit
```

For the live release target, use the already approved Railway URL only after deployment:

```powershell
npm.cmd run smoke -- https://hadith-web-production.up.railway.app
```

## Deployment record

This section is intentionally left for the commit and Railway deployment identifier after the final release commit. The application must not be called live-current until that deployment and its post-deploy smoke checks are recorded here.
