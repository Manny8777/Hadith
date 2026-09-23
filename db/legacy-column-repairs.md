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
