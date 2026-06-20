# Data model — the `ilal_*` tables

Five dedicated tables, all prefixed `ilal_`. They are **additive, isolated, and
reversible** — defined in `db/ilal_schema.sql`. They reference railway core data
only through:

- hard foreign keys: `narrators(id)`, `books(id)`, and each table's own parent;
- two **soft "lens" bridge columns** (no FK constraint, just an integer holding a
  `hadith_toc.main_id` / `takhrij.group_id`): `matched_main_id` and
  `takhrij_group_id`.

**Teardown** (from the schema header):
```sql
DROP TABLE ilal_refs, ilal_ilal, ilal_takhrij, ilal_entries, ilal_companions CASCADE;
```

## Relationships

```
ilal_companions (1) ──< ilal_entries (1) ──< ilal_takhrij   (takhrīj sources)
                                       ├──< ilal_ilal       (علل / criticism)
                                       └──< ilal_refs        (المسند الجامع / تحفة الأشراف / secondary)

ilal_companions.narrator_id  ──► narrators(id)        (companion as a railway narrator)
ilal_entries.matched_main_id ──► hadith_toc.main_id   (THE LENS — soft, no FK)
ilal_entries.takhrij_group_id──► takhrij.group_id     (parallel-narrations group — soft)
ilal_takhrij.railway_book_id ──► books(id)
ilal_takhrij.matched_main_id ──► hadith_toc.main_id   (per-source lens — soft, no FK)
ilal_ilal.narrator_id        ──► narrators(id)
```

All child tables cascade on delete from their parent (`ON DELETE CASCADE`).

---

## `ilal_companions` — مسند منظَّم بالصحابة

One row per صحابي (the book is organized by Companion).

| Column | Type | Meaning |
|---|---|---|
| `id` | SERIAL PK | |
| `seq` | INTEGER | ترتيب الصحابي في الكتاب (e.g. ٤). Parsed from the title `"٤ - أبيض بن حمال"`. |
| `name` | TEXT NOT NULL | Companion name, e.g. `أبيض بن حمال المأربي`. |
| `slug` | TEXT UNIQUE | URL slug, e.g. `4-abyad-ibn-hammal`. Tashkeel-stripped + de-duplicated. |
| `title_page` | INTEGER | `musnad.db` `page_num` of the Companion's title page. |
| `tarjama` | TEXT | Companion biography, taken from the title page's footnote (`foot`). |
| `narrator_id` | INTEGER → `narrators(id)` | The Companion as a railway narrator (links to `/narrator/[id]`). Set manually in the sample; **left NULL by the bulk extractor**. |

Index: `idx_ilal_comp_slug` on `slug`.

---

## `ilal_entries` — كل حديث في الكتاب

One row per hadith of the book. **This is where the lens lives.**

| Column | Type | Meaning |
|---|---|---|
| `id` | SERIAL PK | |
| `companion_id` | INTEGER → `ilal_companions(id)` CASCADE | Owning صحابي. |
| `seq` | INTEGER | Order within the Companion (1-based). |
| `hadith_no` | INTEGER | The book's own hadith number, e.g. ٩٨. |
| `isnad_context` | TEXT | Lead-in isnad text up to the matn, e.g. `عن سعيد بن أبيض، عن أبيه أبيض بن حمال`. |
| `matn` | TEXT | The matn text (extracted from between `«…»`). |
| `lafz_attr` | TEXT | "اللفظ ل…" attribution (e.g. `اللفظ لابن ماجة`), if present in the footnote. |
| `judgment` | TEXT | The authors' حكم verdict line, e.g. `إسناده ضعيف`. (Populated from the فوائد page's `qulna` field.) |
| `fawaid` | TEXT | The book's **full «الفوائد» block** for the hadith — verdict + the authors' علل analysis and scholar quotes (e.g. ابن القطان / الذهبي). Cleaned body of the `has_fawaid=1` pages, with the leading `- فوائد:` marker stripped. Rendered as the "الفوائد" section. علل are parsed **only** from this text (never from the hadith footnote), which prevents the companion bio leaking in as a علة. |
| `juz` | INTEGER | (Reserved; not populated by the current extractor.) |
| `print_page` | INTEGER | Printed-edition page number (٢١٠). |
| `page_num` | INTEGER | `musnad.db` `page_num` of the body text (٣٢٥). |
| **`matched_main_id`** | INTEGER | **The lens.** The representative `hadith_toc.main_id` chosen by group-mode matching. Drives `IsnadTree` and the `/hadith/[main_id]` link. NULL ⇒ no live chain. |
| **`takhrij_group_id`** | INTEGER | The `takhrij.group_id` (parallel-narrations group) the entry resolved to. Shown on the page as "تخريج #N". |
| `body_raw` | TEXT | Raw concatenated body text (≤ 8000 chars), kept for reference/debugging. |
| `foot_raw` | TEXT | Raw concatenated footnote text (≤ 8000 chars). |

Index: `idx_ilal_entry_comp` on `companion_id`.

---

## `ilal_takhrij` — مصادر التخريج (the bridge into railway)

One row per cited takhrīj source for an entry. Each citation independently records
which railway hadith it maps to.

| Column | Type | Meaning |
|---|---|---|
| `id` | SERIAL PK | |
| `entry_id` | INTEGER → `ilal_entries(id)` CASCADE | |
| `sort` | INTEGER | Citation order within the entry. |
| `source_book` | TEXT | Book name as cited, e.g. `الدارمي` / `ابن ماجة`. |
| `source_no` | TEXT | Hadith number as written (Arabic-Indic digits), e.g. `٢٧٧١`. |
| `source_no_int` | INTEGER | Same number as Western integer, `2771`. |
| `railway_book_id` | INTEGER → `books(id)` | Railway book id resolved via `BOOKMAP` (الدارمي→9, ابن ماجة→6, …). |
| **`matched_main_id`** | INTEGER | Per-source lens: the `main_id` of this source's member inside the resolved group (so each takhrīj line can link to its own `/hadith/[id]`). |
| `edition_kb_id` | INTEGER | KetabOnline edition id of the verified source edition. (Schema column; not populated by the bulk extractor.) |
| `edition_note` | TEXT | e.g. `ت الغمري، فتح المنان`. (Schema column; surfaced in the UI via the page's `EDITIONS` map, not this column.) |
| `isnad_text` | TEXT | The source's isnad snippet (`قال: أخبرنا …`), trimmed to ≤ 300 chars. |
| `match_status` | TEXT DEFAULT 'pending' | `matched` / `unmatched` (extractor sets one of these per row). Schema also anticipates `edition-mismatch`. |

Indexes: `idx_ilal_takhrij_entry` on `entry_id`, `idx_ilal_takhrij_main` on `matched_main_id`.

---

## `ilal_ilal` — العلل (narrator criticism from the فوائد)

One row per critic-quote found in the entry's فوائد / footnotes.

| Column | Type | Meaning |
|---|---|---|
| `id` | SERIAL PK | |
| `entry_id` | INTEGER → `ilal_entries(id)` CASCADE | |
| `sort` | INTEGER | Order within the entry. |
| `narrator_id` | INTEGER → `narrators(id)` | The criticized narrator, when linkable. (Schema column; not auto-linked by the current extractor.) |
| `narrator_name` | TEXT | Narrator name as written. (Schema column; not populated by the current extractor.) |
| `scientist` | TEXT | The critic, e.g. `الذهبي` / `ابن القطان`. |
| `say_text` | TEXT | The quote, e.g. `ثابت بن سعيد … لا يعرف`. |
| `garh_label` | TEXT | A normalized verdict tag matched from a fixed list: `لا يعرف`, `مجهول`, `لا يصح`, `ضعيف`, `منكر`, `متروك`, `ثقة`, `صدوق`, `صحيح`, `حسن`. |
| `source_ref` | TEXT | Citation of the source, e.g. `«ميزان الاعتدال» ١/٣٦٤`. |

Index: `idx_ilal_ilal_entry` on `entry_id`.

---

## `ilal_refs` — إحالات (cross-index references)

References to the المسند الجامع / تحفة الأشراف (primary indexes) and to secondary
takhrīj books.

| Column | Type | Meaning |
|---|---|---|
| `id` | SERIAL PK | |
| `entry_id` | INTEGER → `ilal_entries(id)` CASCADE | |
| `sort` | INTEGER | Order within the entry. |
| `ref_book` | TEXT | e.g. `المسند الجامع` / `تحفة الأشراف` / `الطبراني`. |
| `ref_no` | TEXT | The reference number(s), e.g. `٩٨`. |
| `kind` | TEXT | `primary-index` (المسند الجامع، تحفة الأشراف) or `secondary` (everything else). |

Index: `idx_ilal_refs_entry` on `entry_id`.

---

## Worked example — أبيض بن حمال, الحديث ٩٨

A single book entry and how it lands in the tables (from the `أبيض بن حمال` sample,
`db/ilal_populate_sample.py`; the bulk extractor produces the same shape).

**`ilal_companions`**

| seq | name | slug | narrator_id |
|---|---|---|---|
| 4 | أبيض بن حمال المأربي | `abyad-ibn-hammal` | 399 |

**`ilal_entries`** (the hero row)

| hadith_no | matn (abridged) | matched_main_id | takhrij_group_id | judgment |
|---|---|---|---|---|
| 98 | «… استقطاع الملح …» (about granting the salt mine) | 111375 | *(group of the parallels)* | إسناده ضعيف؛ … |

**`ilal_takhrij`** — the two cited sources (the lens points each into railway):

| sort | source_book | source_no | source_no_int | railway_book_id | match_status |
|---|---|---|---|---|---|
| 1 | الدارمي | ٢٧٧١ | 2771 | 9 | matched |
| 2 | ابن ماجة | ٢٤٧٥ | 2475 | 6 | matched |

**`ilal_ilal`** — the علة:

| scientist | say_text | garh_label | source_ref |
|---|---|---|---|
| الذهبي | ثابت بن سعيد … لا يعرف | لا يعرف | «ميزان الاعتدال» … |

On the page this entry renders as: the matn as a hero block, a live `IsnadTree`
built from `getChainsForHadith(111375)`, the two takhrīj lines each linking to
`/hadith/[main_id]` with the «الدارمي» / «ابن ماجة» edition chips, and the الذهبي
علة under "العلل وأقوال النقاد".

> Note: `111375` is the representative `main_id` for ح98 in the sample's verified
> `REP` map. The bulk extractor derives the representative dynamically via
> group-mode (see `pipeline.md`), so the exact `main_id` it stores may differ but
> resolves to the **same parallel-narrations group**.
