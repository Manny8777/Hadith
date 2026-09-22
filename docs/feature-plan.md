# Feature Plan — Hadith Encyclopedia (web)

**Goal:** Make this platform **more functional and better overall than [hdith.com](https://hdith.com/encyclopedia/)**, while keeping its strengths: same underlying corpus, multiple isnads per matn, per-hadith judgments/takhrij, and fine-grained topics.

---

## 1. What already works (keep — do NOT rebuild)

Audited current state. These are complete and should be **polished, not rewritten**.

| Area | Status |
|---|---|
| Hadith detail (`/hadith/[id]`) | ✅ Rich: text, **multiple isnads**, per-scientist judgments + grading, subjects, related/parallel texts, takhrij (تخريج), service badges (الشرح، الغريب، الطب، الفقه، أسباب النزول…), ghareeb words, Quran refs, witnesses, common narrators, narrator network graph |
| Search (`/search`) | ✅ text + أطراف scope, book filter, grade filter (سلف/حسن/ضعيف), subject filter, **chain-depth filter**, narrator mode (all hadiths through a given narrator), narrator + text combo, parallel-count badges |
| Book detail (`/books/[id]`) | ✅ part/chapter/page pagination, sub-chapters with hadith counts, `by-num` lookup, service-content samples |
| Narrator page (`/narrator/[id]`) | ✅ biography (from books), teachers/students, grading (إبن حجر/الذهبي), peers (common narrators), topic distribution, hadiths, export, compare |
| **Musakarat / contradictions** (`/controversial`) | ✅ full nested tree with breadcrumbs; leaf nodes link to the scholarly sources |
| Topics, lexicon (غريب), scholars, Quran, tafsir | ✅ present |
| Components | ✅ 38 components: export, save/bookmark, prev/next, numbering (Harfi/Matba), numeral converter, chain analysis, matn comparison/variant/similarity |

**Data parity (verified):** 33 core books — 32/33 have **exact** hadith counts vs hdith.com (Bukhari off by +2). Narrator top-21 counts match exactly. We additionally have isnad chains (250k), takhrij, judgments, service flags, and 21,994 topic categories.

---

## 2. Gap analysis vs hdith.com

| Feature (hdith.com) | Here | Gap |
|---|---|---|
| **Search by sanad** (البحث بواسطة السند / chain builder) | ⚠️ Backend `chain-filter` exists (2–5 narrators, GIN containment). **No UI.** | **Headline gap** — Phase 1 |
| Multiple isnads per matn | ✅ present in DB + detail | Surface it explicitly — Phase 2 |
| Contradictions (مشكل الآثار) | ✅ page + tree | Entry point from a hadith; pair view — Phase 3 |
| All-hadiths-through-a-person (الأطراف) | ✅ narrator mode + `/narrator/[id]` | ✅ essentially done |
| Book/chapter/page + standardized number | ✅ | ✅ done |
| Subject tree, narrators (طبقات), gharib, Quran, indexes | ✅ | ✅ done |
| Bookmark, prev/next, text-size, dark mode | ✅ (themeContext, HadithExport, SaveHadith) | ✅ mostly done |

**Net:** we're data-richer and feature-rich on the *detail* pages; the main *discovery* features (sanad builder) and a few polish/entry points are missing.

---

## 3. Prioritized roadmap

### Phase 1 — Search by Sanad (البحث بواسطة السند) ⭐ flagship
hdith.com's standout researcher tool; our backend is half-built.

1. **`GET /api/chain-candidates?narrator_id=N&direction=next|prev`** — returns the narrators that immediately **follow** (or precede) N in any isnad, enabling step-by-step building.
   - Data: `isnad_chains.narrator_id_array` (integer array). Use `array_position(arr, N)` + `generate_subscripts` to read `arr[pos+1]` / `arr[pos-1]`, `DISTINCT` the result.
2. **`GET /api/chain-filter` (exists)** — keep as the "find hadiths through these narrators" endpoint.
   - **Add a strict-ordered mode** (optional): match an exact sequence `n1 → n2 → …` consecutive in order (current `@>` is order-independent containment). This turns "contains these narrators" into a true chain search.
3. **`/asaneed/builder` page** (client):
   - Step 1: narrator autocomplete (reuse `narrators-search`).
   - After pick, show **followers** from `chain-candidates`; pick N2; repeat up to 5.
   - "Find" → `chain-filter(narrator_ids)` → results reusing existing result cards (grade chips, parallel count, book filter, scope, pagination).
   - Add **Search by Sanad** to the nav header.
4. Verify: same chain → results comparable to hdith.com for the same query.

### Phase 2 — Multi-chain / all-isnads view (per matn)
We already store all isnads for a hadith.
1. Verify the detail sidebar renders **all** chains, or only the dominant (`dominantIsnadType`). If only dominant: add a **"show all N chains" selector** (default = dominant).
2. Per chain: full timeline with full name + short name (name shortening already in `narratorName.ts`).
3. **"Copy shareable chain link"** — encode the chain in the URL so a chain is directly openable.
4. Confirm `IsnadTree` renders branches where an isnad forks.

### Phase 3 — Musakarat polish
Tree already works; add entry points + the pair view.
1. **On the hadith detail page:** a badge/link "this matn belongs to a musakarat issue" when one exists.
   - Verify join path (via `hadith_services`/`service_content` → `hadith_controversial_tree.node_id`). If absent, add a hadith→node link.
2. **On a musakarat leaf:** list the hadiths composing the issue with links to each hadith's detail — i.e., a **side-by-side pair view** (the "مُسْأَرَة/مشكلة").

### Phase 4 — Search + UX polish
1. Narrator autocomplete: debounce + show short name & death year.
2. Search results: **Save** (bookmark) action, "clear all filters" chip, result count.
3. **Load-more / deep pagination** on heavy modes (narrator-only can be thousands).
4. Wire **Find-by-number** (HadithNumSearch) into the nav for quick standard-number lookup.
5. **Mobile (375px):** hadith sidebar → collapsible tabs (text / sanad / services / subjects). Verify book + narrator pages.
6. Empty states + loading skeletons for the new pages.

### Phase 5 — Performance
- Hadith detail fires ~10 parallel queries — measure p95; target < ~1s.
- Cache static reference data (books, subject categories) per session.
- Confirm the GIN index on `isnad_chains.narrator_id_array` exists (chain-filter depends on it); add if missing.
- Reconsider `force-dynamic` on always-dynamic pages where a static fallback would help.

### Phase 6 — Data (lower priority)
- **113 reference books** (sharh/rijal/athar + dictionaries/history/poetry):
  - Source: **legacy app source on Desktop** (`Desktop\Islam`) — user confirmed location.
  - Reuse the Phase-1 extraction pattern (engine/DLL or the `.dat`/JSON in `Islam`).
  - Decide TOC shape: these are not "hadith" — use a reference/content section rather than `tarf`.
- **Skip (per decision):** 2-row Bukhari count discrepancy (7,410 vs 7,412).

---

## 4. Acceptance / verification
1. **Sanad builder:** building a known chain returns the expected hadiths; result set is comparable to hdith.com for the same chain.
2. **Multi-chain:** a matn with several isnads shows all; switching shows each full timeline.
3. **Musakarat:** from a hadith, one click reaches its issue; from an issue, each hadith opens its detail.
4. **Data parity:** all 33 core books render; top-21 narrator counts unchanged (match hdith.com).
5. **Mobile:** all key pages usable at 375px.
6. **Performance:** hadith detail p95 < ~1s on the live DB.
