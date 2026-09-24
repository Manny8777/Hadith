# Column repairs: restoring a migrated column from the original's own values

Three columns were found (by a whole-table column differ, see `legacy-audit/harness/cmp`) to hold
values the original app does not have. Each was re-loaded from the original's corresponding column.
The differ was re-run after every repair; the "after" figures below are its output.

| table | column | before | after |
|---|---|---|---|
| `hadith_toc` | `tarqeem_matboa2` | 144,761 of 339,607 rows wrong; 28,343 values the original never had (blank in 267,921 original rows vs 239,578 migrated) | **339,607 / 339,607**, blanks 267,921 both sides |
| `hadith_service_content` | `next_id` | agreed in 3,380 of 600,575 rows (values shifted by a row) | **600,575 / 600,575** |
| `hadith_service_content` | `prev_id` | agreed in 265,993; the original's blanks lost (264,591 -> 1,922) | **600,575 / 600,575**, blanks 264,591 / 264,592 |
| `narrators` | `user_comments` | 11 concatenated editor notes spread over 10,923 narrators | **30,087 / 30,087** (223 real notes) |

## Recipe

1. Measure the key on both sides before trusting any diff. The join key must be unique on both:
   `MainID <-> main_id` (339,607), `MainID <-> id` for services (600,575), `ID <-> id` for narrators
   (30,087). `hadith_toc.id` / legacy `ID` are NOT keys (44,643 distinct of 339,607).
2. Export the original's column, keyed and trimmed:

   ```
   bash legacy-audit/harness/cmp/run.sh legacy-audit/harness/cmp/export_column.py \
        <LegacyTable> <KeyField> <ValueField> <out.jsonl>
   ```

3. Apply it (dry run first — it prints what would change and refuses to write if the map does not
   cover every destination row, or if the key is not unique on either side):

   ```
   node db/apply_legacy_column.js <pg_table> <pg_key_col> <pg_column> <jsonl> [--apply]
   ```

   Examples actually run:

   ```
   node db/apply_legacy_column.js hadith_toc main_id tarqeem_matboa2 \
        legacy-audit/harness/cmp/work/hadith_tarqeem_matboa2.jsonl --apply
   node db/apply_legacy_column.js narrators id user_comments \
        legacy-audit/harness/cmp/work/nouns_user_comments.jsonl --apply
   node db/fix_service_next_prev.js --apply          # the two-column services case
   ```

4. Re-run the differ and require 0 differences before believing the repair.

## Traps

- The migration's row order does not match the original's, so a positional comparison of a whole
  table is invalid; and a column named `ID` is not necessarily a key. Measure `count(*)` against
  `count(DISTINCT ...)` on both sides first.
- The original's RAW (cp1256) text columns carry a trailing space per record. Trim on export, and
  keep blank-vs-NULL explicit (`NULLIF(v,'')`).
- These writes are large: a 300k-600k row `UPDATE` against the Railway instance takes 10-15 minutes.
  Run it as a background process, and do not verify through a temp table created with
  `ON COMMIT DROP` — `COMMIT` drops it before the check runs, so the write looks like it failed.
- A failed repair leaves nothing behind: the map load and the `UPDATE` share one transaction.

# Membership repairs: restoring rows a key or a filter threw away

Two relations were losing rows rather than corrupting values. Both are now loaded from the
original's own table; the differ reports zero absent rows on either side.

| table | before | after |
|---|---|---|
| `takhrij` | 273,698 rows; `PRIMARY KEY (hadith_id)` keeps one membership per hadith, so 6,606 rows (6,561 distinct memberships) were missing. Truncated groups: 105860 664/675, 105903 429/434, 110212 345/347, 110213 301/308, 107884 300/304. | **280,259 rows** = every distinct membership the original holds (it has 281,541 rows / 280,259 distinct; the other 1,282 are rows duplicating another row exactly) |
| `narrator_relations` | 7,989 rows; the loader dropped every row whose `SecondRawyID = 0` (6,100 rows, 3,529 distinct keys) and dropped `SayID` | **11,518 rows** = the original's distinct relations, with `legacy_say_id` set on all of them and the 3,529 `second_id = 0` rows restored |

## Why these were dropped

- `takhrij` was keyed `PRIMARY KEY (hadith_id)` — a schema defect, not a load bug. It is now keyed
  `UNIQUE (hadith_id, group_id, compound_matn_id)`, with `idx_takhrij_hadith` added because several
  routes filter on `hadith_id` and would otherwise lose their index (`db/schema_takhrij.sql`).
- `narrator_relations` was loaded with a filter on the second narrator. The restored rows have
  `second_id = 0`, which never joins to a narrator, so the teachers/students lists are unchanged.

## What is deliberately not restored

The original's remaining same-key rows: 13,851 positive-second relation rows collapse to 7,989
distinct `(first, second, type)` keys. Inserting them would repeat names in
`app/api/narrator/[id]/route.ts`, which selects those lists without `DISTINCT`. The relation *set*
is complete without them, and `legacy_say_id` carries the provenance (for a key the original repeats,
the lowest `SayID` is recorded).

## Verification

```
bash legacy-audit/harness/cmp/run.sh legacy-audit/harness/cmp/probe_sets_after.py
```

prints, for each table, legacy rows vs distinct keys vs the migrated row count, plus the absent
counts in both directions: `takhrij` legacy rows absent 0 / web rows absent 0, `narrator_relations`
legacy-only 0 / web-only 0. Per-group counts were checked against the original's *distinct*
memberships (`probe_group_dups.py`), which is what separates a real shortfall from the original's
own duplicate rows.
