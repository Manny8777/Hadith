# Source editions & verification

The book cites 23 source collections (موارد الكتاب). For the lens to number-match,
railway's stored numbering must agree with the **specific printed edition** the
authors used. This doc records which editions were obtained, how, and how the
numbering was verified.

- Authoritative source list (محقق / publisher / year per source):
  `C:\HadithProg\docs\ilal\Book\references.md`.
- Extracted-HTML manifest with verdicts:
  `…\KetabOnline-V3.2.0\Books\ilal_html\_manifest.md`.
- KetabOnline extraction method:
  `…\KetabOnline-V3.2.0\Books\README.md`.

---

## How the editions were pulled — KetabOnline

The 23 sources were exported as HTML out of the **KetabOnline** Windows desktop app
(`KetabOnline-V3.2.0`). Mechanics (from the Books `README.md`):

- The app ships a bundled **Elasticsearch** on `http://localhost:9200`
  (user `kibana_admin`, pass `Smartech@1432`) — the app must be **running**.
- The catalog of ~30,000 books is a SQLite file disguised as `MaterialDesigns.Wpf.dll`
  (table `Books`: Id, Title, Author_Name, Download_Status, Type). Downloading a book
  does **not** copy a file; it only flips a status flag and writes the text into the
  shared Elasticsearch index `bookdetails`.
- Each downloaded book is one `bookdetails` doc keyed by book Id, with
  `books_page[]` (every page's HTML), `parts[]` (الأجزاء), and `index[]` (nested فهرس).
- Helper scripts in that folder:
  ```bash
  python search_books.py "فتح المنان"        # find Id in the SQLite catalog
  python search_books.py "فتح المنان" --es    # search only DOWNLOADED books (ES)
  python export_book.py 67138 <out-dir>      # render one Id → self-contained RTL HTML
  ```
  Run with `PYTHONUTF8=1 python -X utf8 …` so Arabic prints. Python 3, stdlib only.

> The README also notes a **public backend path** (`backend.ketabonline.com/api/v2`,
> serving an unencrypted `.data.zip`) as the way to pull any book without the app —
> the same `books_page` / `index` shape, fetched over HTTP instead of local ES.

The rare محقق editions the authors required (عوامة، عالم الكتب، الأزهري، الخانجي،
الفهيد) exist on KetabOnline under high "ط أخرى" ids that aren't in the app's local
index; they were found via site search.

---

## How numbering was verified

Hadith **number is the matching key.** To confirm an extracted edition's numbering
agrees with the author's edition, specific cited hadith numbers from the parent book
(المسند المصنف المعلل) were looked up in the extracted text and checked that the
number lands on the same hadith. Per the manifest, **10/10 spot-checked numbers
matched**.

Verdict legend:
- **exact** — the exact required edition.
- **numbering-ok** — different publisher, but numbering verified identical.
- **gap** — required edition not available as clean numbered text.

---

## The 23 sources — verdict table

(From `ilal_html/_manifest.md`. `kb_id` = KetabOnline book id. ✅ marks a spot-checked
hadith-number match.)

| # | Source | Required edition (author) | kb_id | Actual محقق/publisher | Verdict | № check |
|---:|---|---|---:|---|:--:|:--:|
| 1 | مالك / الموطأ | بشار عواد، دار الغرب، 1417 | 54839 | بشار عواد، دار الغرب 1417 | exact | — |
| 2 | عبد الرزاق / المصنف | الأعظمي، المكتب الإسلامي، 1403 | 1686 | حبيب الرحمن الأعظمي، 1403 | exact | — |
| 3 | الحميدي / المسند | حسين أسد، دار السقا، 1423 | 6034 | دار السقا (حسين أسد) | exact | — |
| 4 | ابن أبي شيبة / المصنف | عوامة، دار القبلة، 1427 | 16105 | محمد عوامة، دار القبلة | exact | ✅ #٢٦٥٦ |
| 5 | أحمد / المسند | عالم الكتب/النوري، 1419 | 103047 | أبو المعاطي النوري، عالم الكتب 1419 | exact | ✅ #٢١٤١٧ |
| 6 | عبد بن حميد / المنتخب | السامرائي، عالم الكتب، 1408 | 1682 | صبحي السامرائي، 1408 | exact | — |
| 7 | الدارمي / المسند | الغمري، دار البشائر، 1419 | 67138 | الغمري (فتح المنان)، 1419 | exact | ✅ #٨٠٦ |
| 8 | البخاري / الجامع الصحيح | دار الشعب / أرقام فتح الباري | 2130 | طوق النجاة عن السلطانية 1422 | numbering-ok | ✅ #١٢٢ |
| 9 | البخاري / الأدب المفرد | الخانجي/عبد المقصود رضوان، 1423 | 16108 | عبد المقصود رضوان، الخانجي 1423 | exact | — |
| 10 | البخاري / خلق أفعال العباد | الفهيد، أطلس الخضراء، 1425 | 54758 | فهد الفهيد، أطلس الخضراء | exact | — |
| 11 | البخاري / رفع اليدين | أحمد الشريف، دار الأرقم، 1404 | 2085 | أحمد الشريف، دار الأرقم 1404 | exact | — |
| 12 | البخاري / القراءة خلف الإمام | الأزهري، دار الفاروق، 1431 | 102267 | محمد الأزهري، دار الفاروق | exact | — |
| 13 | مسلم / الصحيح | إستانبول 1329 / ترقيم عالم الكتب | 2229 | عبد الباقي (= ترقيم عالم الكتب) | numbering-ok | — |
| 14 | ابن ماجه / السنن | بشار عواد، دار الجيل، 1418 | 1082 | عبد الباقي (نفس ترقيم بشار) | numbering-ok | ✅ #٦٠٩، #٨٨٦ |
| 15 | أبو داود / السنن | شعيب الأرنؤوط، الرسالة، 1430 | 1013 | شعيب الأرنؤوط، الرسالة 1430 | exact | ✅ #٩٠٠ |
| 16 | أبو داود / المراسيل | شعيب الأرنؤوط، الرسالة، 1408 | 1584 | شعيب الأرنؤوط، الرسالة 1408 | exact | — |
| 17 | الترمذي / الجامع | بشار عواد، دار الغرب، 1998 | 5886 | بشار عواد، دار الغرب 1998 | exact | ✅ #١١٠ |
| 18 | الترمذي / الشمائل | الجليمي، الكتب الثقافية، 1412 | 1559 | سيد عباس الجليمي | exact | — |
| 19 | النسائي / المجتبى | المكتبة التجارية، 1348 (+ التأصيل 1433) | 5983 | أبو غدة (ترقيم مختلف — مؤكَّد) | **gap** | ❌ #١٦٥٩، #٢٤٨٩ لا تطابق |
| 20 | النسائي / السنن الكبرى | حسن شلبي، الرسالة، 1421 | 6007 | حسن شلبي، الرسالة 1421 | exact | — |
| 21 | أبو يعلى / المسند | حسين أسد، دار المأمون، 1413 | 1354 | حسين أسد، دار المأمون | exact | ✅ #١٥٥٢ |
| 22 | ابن خزيمة / صحيح | الأعظمي، مكتبة الأعظمي ط3، 1430 | 1956 | الأعظمي (المكتب الإسلامي) | exact | — |
| 23 | ابن حبان / الإحسان | شعيب الأرنؤوط، الرسالة ط2، 1414 | 2230 | شعيب الأرنؤوط، الإحسان/الرسالة | exact | — |

**Summary:** 22 / 23 are the required edition or a verified-identical numbering.
10/10 spot-checked numbers matched.

> Note: the `kb_id`s above are KetabOnline ids and are independent of railway
> `books.id`. The mapping from a cited book name to a railway `books.id` lives in
> the extractor's `BOOKMAP` (see `pipeline.md`), not in these ids. The companion
> page surfaces a short edition label per source via the `EDITIONS` map in
> `app/musnad-musannaf/[companion]/page.tsx` (e.g. الدارمي → "ت الغمري «فتح المنان»").

---

## The one open gap — النسائي / المجتبى

The author cites the المجتبى in the **المكتبة التجارية 1348 (دار التأصيل 1433)**
edition's numbering. That edition is **not available as clean, numbered text** on
KetabOnline or Shamela:

- What *is* available (kb_id 5983) is the **أبو غدة** numbering, whose numbers are
  **verified different** (spot-checks #١٦٥٩ and #٢٤٨٩ did not match).
- The only thing carrying the author's numbering is **messy archive.org OCR**, not
  usable as a clean source.

**Consequence for the lens:** `النسائي (…)` citations may not number-match. Entries
that *also* cite a matched source still resolve via group-mode (the majority vote
saves them); entries whose **only** takhrīj is النسائي can fail to get a
`matched_main_id`. This is the known sharp edge of the otherwise-robust matcher.
