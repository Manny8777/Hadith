# Extraction & matching pipeline

The whole book is parsed and matched by **`db/ilal_extract_all.py`**. The earlier
**`db/ilal_populate_sample.py`** is the prototype that did the same for a single
companion (أبيض بن حمال, ح97–100) with a hand-verified `REP` map — useful to read
as the simplest version of the logic.

---

## 1. Input — `docs/ilal/Book/musnad.db`

A SQLite database of the printed book, pre-parsed into pages.

- `companions` table: `(title_page, title)`. `title` looks like `"٤ - أبيض بن حمال المأربي"`.
- `pages` table: **42,688 rows**, one per printed page, with columns:
  - `page_num` — sequential page id (the join key everywhere).
  - `body` — the page body (matn + isnad + takhrīj), HTML-ish.
  - `foot` — the footnote text (علل, lafz attribution, refs, tarjama).
  - `print_page` — the printed-edition page number.
  - `hadith_num` — the book's hadith number if this page *starts* a hadith, else NULL.
  - `companion_title` — set on title pages.
  - `has_fawaid` — boolean: this page is a فوائد page (extended discussion).
  - `qulna` — the authors' "قلنا" verdict text (the حكم), on فوائد pages.

Paths/connection are **hardcoded at the top of the script**:
```python
MUSNAD = r"C:\HadithProg\docs\ilal\Book\musnad.db"
PG     = "postgresql://postgres:…@tramway.proxy.rlwy.net:39193/railway"
```

---

## 2. Page → companion → entry grouping

For each companion (ordered by `title_page`), the extractor walks pages from this
companion's `title_page` up to the next companion's title page, building entries:

- **A page that starts a hadith** (`hadith_num` set) opens a new entry.
- **Special case — shared title page:** on the title page itself `hadith_num` is
  often NULL even though the first hadith starts there. The script sniffs the body
  for a leading `«NUM - عن/حدثنا/أخبرنا/قال/أنه …»` pattern and recovers the number,
  so the Companion's first hadith isn't lost.
- **فوائد pages** (`has_fawaid`) are attached to the current entry's footnote bucket
  (`fw`) — that's where علل and the حكم live.
- **Continuation pages** (no number, not فوائد) append to the current entry's body.

The result per entry: a `body` (joined body pages), a `foot` (joined footnotes from
both body pages and فوائد pages), and the `qulna` verdict from the فوائد page.

---

## 3. `parse_entry(body, foot, qulna)`

Pulls the structured fields out of the raw text:

- **isnad_context** — text before the first `«` (the matn opener), or before `أخرجه`.
- **matn** — the text inside the first `«…»`.
- **lafz_attr** — `اللفظ ل…` matched in the footnote.
- **takhrīj citations** — via the `CITE` regex (below), run over a **tashkeel-
  stripped** copy of the takhrīj region. Stripping diacritics normalizes
  `الدَّارِمي → الدارمي` so the book-name lookup is stable. Each hit yields
  `{book, no, no_int, bid (railway book id), isnad snippet}`; duplicates `(bid,no)`
  are skipped.
- **علل** — `قال X: … . «ref» pages` patterns in the footnote → `{scientist, say,
  garh_label, ref}`. `garh_label` is the first verdict word found from a fixed list.
- **refs** — `المسند الجامع / تحفة الأشراف / الطبراني / …` `(num)` patterns →
  `{book, no, kind}`, where المسند الجامع & تحفة الأشراف are `primary-index`.

### `BOOKMAP` and `CITE`

`BOOKMAP` maps cited source names (and spelling variants) to railway `books.id`:

```python
BOOKMAP = {'النسائي في الكبرى':22, 'عبد الله بن أحمد':8, 'البخاري':1, 'مسلم':2,
 'أبو داود':3, 'أبي داود':3, 'الترمذي':4, 'النسائي':5, 'ابن ماجة':6, 'ابن ماجه':6,
 'مالك':7, 'أحمد':8, 'الدارمي':9, 'ابن حبان':10, 'ابن خزيمة':11, 'الطبراني':12,
 'ابن أبي شيبة':15, 'عبد الرزاق':16, 'البيهقي':17, 'الدارقطني':18, 'البزار':19,
 'الحميدي':20, 'الطيالسي':21, 'أبو يعلى':23, 'الحاكم':24, 'عبد بن حميد':29,
 'سعيد بن منصور':30}
```
`BMS` is the same map keyed by tashkeel-stripped names.

The `CITE` regex matches: optional `«`, a known book name (alternation built
**longest-first** so `النسائي في الكبرى` wins over `النسائي`), optional `»`,
optional `vol/page`, then `(NUMBER)`:

```python
CITE = re.compile(r'(?:«\s*)?(' + _BALT + r')\s*»?\s*(?:[٠-٩]+\s*[/،]\s*[٠-٩]+\s*)?\(\s*([٠-٩]+)\s*\)')
```

---

## 4. In-memory match indexes (built once, up front)

Two indexes are loaded from railway before parsing:

1. **`num2main`** — `(book_id, number) → main_id`, built from the leaf rows of
   `hadith_toc` over **three numbering columns**:
   ```sql
   SELECT main_id, book_id, tarqeem_matboa1, tarqeem_harf, tarqeem_matboa2
   FROM hadith_toc WHERE is_leaf = true
   ```
   So a cited number can match whichever printed/ḥarfī numbering railway stored.
2. **`main2group` + `group_members`** — from the `takhrij` table joined to
   `hadith_toc`:
   ```sql
   SELECT t.hadith_id, t.group_id, h.book_id
   FROM takhrij t JOIN hadith_toc h ON h.main_id = t.hadith_id
   ```
   `main2group[main_id] = group_id`; `group_members[group_id] = [(book_id, main_id), …]`.

---

## 5. Group-mode matching — `resolve(cites)`

This is the heart of the lens, and why it survives edition-numbering differences.

```
for each citation:  main_id = num2main[(book_id, number)]   → list of candidate main_ids
if no candidates:   return (None, None)        # no lens
grps = Counter(main2group[m] for each candidate)
gid  = grps.most_common(1)[0][0]               # the MOST COMMON takhrīj group
members = { book_id: main_id } for that group
rep = first member whose book_id is highest in CORE_PREF, else candidate[0]
return (rep, gid, members)
```

- **Why group-mode, not exact number:** editions differ. The clearest case is
  الدارمي: the cited edition (ت الغمري «فتح المنان») and railway's stored edition
  (حسين أسد) are offset, so `الدارمي (٢٧٧١)` may resolve to a slightly wrong
  `main_id` on its own. But the entry usually cites **several** sources; each lands
  somewhere in railway; the **majority share one `takhrij.group_id`** (they are the
  same hadith's parallel narrations). Picking the modal group makes one offset
  citation a minority vote that cannot win — the match holds.
- **`CORE_PREF`** is a representative-pick order (أبو داود، الترمذي، ابن ماجة،
  مسلم، البخاري، …) so the displayed `main_id` is a "nice" canonical book when the
  group spans many.
- The chosen group's `members` map also lets each individual takhrīj line link to
  **its own** book's `main_id` (`ilal_takhrij.matched_main_id`).

---

## 6. Two-pass build, then bulk insert

- **Pass 1 (local, fast):** parse every companion + entry into Python dicts,
  resolving the lens in memory. Slugs are made unique here: tashkeel-stripped,
  `seq-`prefixed, and if a collision occurs, `-2`, `-3`, … is appended
  (`used_slugs` set).
- **Pass 2 (DB):** `TRUNCATE` all five tables `RESTART IDENTITY CASCADE`, then bulk
  insert with `psycopg2.extras.execute_values`:
  - companions inserted with `fetch=True` so their new ids come back;
  - entries inserted likewise (ids returned to wire up children);
  - takhrīj / علل / refs inserted in chunks (3000 rows at a time).

  Each takhrīj row's `match_status` is `matched` if the resolved group has a member
  in that source's book, else `unmatched`.

At the end the script prints a summary:
```
companions: …   entries: … (matched …, …%)   takhrij: …   ilal: …   refs: …
```
That printed `matched %` is the source of the "~73% with a live chain" figure in
the README — read it from a fresh run for the current number.

---

## 7. How to re-run

```bash
# full extraction (truncates + repopulates all 5 tables)
python db/ilal_extract_all.py

# limited test — first N companions only
python db/ilal_extract_all.py --limit 5
```

- **Dependency:** `psycopg2` (and stdlib `sqlite3`). No other packages.
- **Targets:** the SQLite `MUSNAD` path and the PostgreSQL `PG` URL are
  **hardcoded** at the top of the script — edit them there if they change.
- **Destructive:** Pass 2 `TRUNCATE … RESTART IDENTITY CASCADE` wipes and rebuilds
  the `ilal_*` tables every run (ids reset). Safe because the tables are isolated;
  nothing else references them.
- The schema must already exist — run `db/ilal_schema.sql` once first if the tables
  are missing.

---

## 8. Known limitations

- **آثار without a takhrīj number have no lens.** Mawqūf reports the book cites
  without `BOOK (NUM)` produce no candidate → `matched_main_id` stays NULL → no
  `IsnadTree`. This is the bulk of the unmatched ~27%.
- **النسائي / المجتبى numbering gap.** The author's edition (المكتبة التجارية
  ١٣٤٨ / دار التأصيل) isn't available as clean numbered text; railway's النسائي
  numbering (أبو غدة) differs and is *verified* not to match. So `النسائي (…)`
  citations may not number-match. Group-mode rescues entries that *also* cite other
  matched sources; entries citing **only** النسائي can miss. See `editions.md`.
- **Over-segmentation is minor.** Occasionally the title-page first-hadith sniff or
  a stray number splits one hadith into two entries. Low frequency; cosmetic.
- **`narrator_id` linking is not automated** in the bulk run — `ilal_companions.
  narrator_id` and `ilal_ilal.narrator_id` are left NULL (the sample set them by
  hand). The page degrades gracefully (the "ترجمة الراوي ↗" link just doesn't show).
