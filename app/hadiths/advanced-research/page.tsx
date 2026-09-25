import pool from '@/lib/db'
import Link from 'next/link'
import MatnMatchLine from '@/app/components/MatnMatchLine'
import UiIcon from '@/app/components/UiIcon'
import { attachMatnSnippets, snipColumns, type SnipPart } from '@/lib/matnSnippet'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'البحث البحثي المتقدم — جامع خادم الحرمين' }

interface ResultRow {
  hadith_id: number
  hadith_text: string
  book_title: string
  chapter_text: string | null
  chain_count: number
  companion_name: string | null
  best_judgment: string | null
  takhrij_group_id: number | null
  // Match line for the matn, attached by attachMatnSnippets (see lib/matnSnippet.ts)
  snippet?: SnipPart[] | null
}

interface BookOption { id: number; title: string }

export default async function AdvancedResearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    text?: string; narrator?: string; chapter?: string; book?: string
    grade?: string; min_chains?: string; page?: string
  }>
}) {
  const sp = await searchParams
  const textQ = sp.text?.trim() || ''
  const narratorQ = sp.narrator?.trim() || ''
  const chapterQ = sp.chapter?.trim() || ''
  const bookId = parseInt(sp.book || '0') || null
  const gradeFilter = sp.grade || ''
  const minChains = Math.max(0, parseInt(sp.min_chains || '0'))
  const page = Math.max(1, parseInt(sp.page || '1'))
  const pageSize = 20
  const offset = (page - 1) * pageSize

  const hasSearch = !!(textQ || narratorQ || chapterQ || bookId || gradeFilter || minChains > 0)

  // hadith_judgments column is say_text (not judgment_text)
  // hadith_toc primary key is main_id (not id in WHERE clauses)
  const gradeSql =
    gradeFilter === 'sahih'   ? `AND EXISTS (SELECT 1 FROM hadith_judgments hj WHERE hj.hadith_id = ht.main_id AND hj.say_text ~* '^صحيح')` :
    gradeFilter === 'hasan'   ? `AND EXISTS (SELECT 1 FROM hadith_judgments hj WHERE hj.hadith_id = ht.main_id AND hj.say_text ~* '^حسن')` :
    gradeFilter === 'daif'    ? `AND EXISTS (SELECT 1 FROM hadith_judgments hj WHERE hj.hadith_id = ht.main_id AND hj.say_text ~* '^ضعيف')` :
    gradeFilter === 'unjudged'? `AND NOT EXISTS (SELECT 1 FROM hadith_judgments hj WHERE hj.hadith_id = ht.main_id)` :
    ''

  // Narrator search uses isnad_hadiths -> isnad_chains -> unnest(narrator_id_array) -> narrators
  const narratorSubquery = `EXISTS (
    SELECT 1
    FROM isnad_hadiths iha
    JOIN isnad_chains ic ON ic.id = iha.isnad_id
    JOIN LATERAL unnest(ic.narrator_id_array) AS nid ON true
    JOIN narrators nf ON nf.id = nid
    WHERE iha.hadith_id = ht.main_id
      AND (nf.name ~* $2::text OR nf.abb_name ~* $2::text)
  )`

  // $1=text, $2=narrator, $3=chapter, $4=book, $5=pageSize, $6=offset
  // Why not the old `ht.tarf ~* $1 OR ht.content ~* $1`: the stored matn is fully vowelled
  // (الْوَسْوَسَة), so a word typed without tashkeel could never match, and the page returned nothing
  // for ordinary queries. This mirrors /api/search's text predicate: normalised (tashkeel and hamza
  // folded, ة→ه) over tag-stripped text, as a phrase, which is also what the original app indexes.
  const textMatchSql =
    `(to_tsvector('simple', normalize_hadith(coalesce(ht.tarf, ''))) @@ ` +
    `phraseto_tsquery('simple', normalize_hadith($1::text)) ` +
    `OR to_tsvector('simple', normalize_hadith(regexp_replace(coalesce(ht.content, ''), '<[^>]*>', ' ', 'g'))) @@ ` +
    `phraseto_tsquery('simple', normalize_hadith($1::text)))`
  const params = [textQ || null, narratorQ || null, chapterQ || null, bookId, pageSize, offset]
  const countParams = [textQ || null, narratorQ || null, chapterQ || null, bookId]

  // hadith_toc columns: main_id (PK), tarf, content, chapter_text, book_id
  // books column: title (NOT name)
  // takhrij: group_id links parallel hadiths across books
  const mainQuery = `
    SELECT ht.main_id AS hadith_id,
           LEFT(regexp_replace(coalesce(ht.tarf, ht.content, ''), '<[^>]+>', ' ', 'g'), 300) AS hadith_text,
           ${snipColumns('ht.content')},
           b.title AS book_title,
           ht.chapter_text,
           (SELECT t.group_id FROM takhrij t WHERE t.hadith_id = ht.main_id LIMIT 1) AS takhrij_group_id,
           (SELECT COUNT(DISTINCT iha2.isnad_id)::int
            FROM isnad_hadiths iha2
            WHERE iha2.hadith_id = ht.main_id) AS chain_count,
           (SELECT n.name
            FROM isnad_hadiths iha2
            JOIN isnad_chains ic2 ON ic2.id = iha2.isnad_id
            JOIN LATERAL unnest(ic2.narrator_id_array) AS nid2 ON true
            JOIN narrators n ON n.id = nid2
            WHERE iha2.hadith_id = ht.main_id AND n.is_companion = true
            LIMIT 1) AS companion_name,
           (SELECT hj.say_text
            FROM hadith_judgments hj
            WHERE hj.hadith_id = ht.main_id
            ORDER BY CASE
              WHEN hj.say_text ~* 'صحيح' THEN 1
              WHEN hj.say_text ~* 'حسن' THEN 2
              WHEN hj.say_text ~* 'ضعيف' THEN 3
              ELSE 4 END
            LIMIT 1) AS best_judgment
    FROM hadith_toc ht
    JOIN books b ON b.id = ht.book_id
    WHERE ht.is_leaf = true AND ht.is_paragraph = true
      AND ($1::text IS NULL OR ${textMatchSql})
      AND ($3::text IS NULL OR ht.chapter_text ~* $3::text)
      AND ($4::int IS NULL OR ht.book_id = $4::int)
      AND ($2::text IS NULL OR ${narratorSubquery})
      ${gradeSql}
    ORDER BY ht.main_id
    LIMIT $5::int OFFSET $6::int`

  const countQuery = `
    SELECT COUNT(*)::int AS cnt
    FROM hadith_toc ht
    WHERE ht.is_leaf = true AND ht.is_paragraph = true
      AND ($1::text IS NULL OR ${textMatchSql})
      AND ($3::text IS NULL OR ht.chapter_text ~* $3::text)
      AND ($4::int IS NULL OR ht.book_id = $4::int)
      AND ($2::text IS NULL OR ${narratorSubquery})
      ${gradeSql}`

  const [booksRes, resultsRes, countRes] = await Promise.all([
    pool.query<BookOption>(`SELECT id, title FROM books ORDER BY tarteeb, id LIMIT 100`)
      .catch(() => ({ rows: [] as BookOption[] })),
    hasSearch
      ? pool.query<ResultRow>(mainQuery, params).catch(err => {
          // Never swallow silently: a hidden fallback here is exactly how this page's search stayed
          // broken (it returned "no results" for every query instead of erroring).
          console.error('advanced-research mainQuery failed:', err)
          return { rows: [] as ResultRow[] }
        })
      : Promise.resolve({ rows: [] as ResultRow[] }),
    hasSearch
      ? pool.query<{ cnt: number }>(countQuery, countParams).catch(() => ({ rows: [{ cnt: 0 }] }))
      : Promise.resolve({ rows: [{ cnt: 0 }] }),
  ])

  const books = booksRes.rows
  // The same match line the search page shows: where the text query falls in the matn, so a match
  // buried in a long matn is visible here too.
  const allResults = await attachMatnSnippets(resultsRes.rows, [textQ])
  const results = minChains > 0 ? allResults.filter(r => r.chain_count >= minChains) : allResults
  const totalCount = countRes.rows[0]?.cnt || 0

  function judgmentColor(j: string | null) {
    if (!j) return 'text-gray-400 bg-gray-50 border-gray-100'
    if (/صحيح/.test(j)) return 'text-green-700 bg-green-50 border-green-100'
    if (/حسن/.test(j))  return 'text-blue-700 bg-blue-50 border-blue-100'
    if (/ضعيف/.test(j)) return 'text-red-600 bg-red-50 border-red-100'
    return 'text-gray-500 bg-gray-50 border-gray-100'
  }

  const paramString = [
    textQ && `text=${encodeURIComponent(textQ)}`,
    narratorQ && `narrator=${encodeURIComponent(narratorQ)}`,
    chapterQ && `chapter=${encodeURIComponent(chapterQ)}`,
    bookId && `book=${bookId}`,
    gradeFilter && `grade=${gradeFilter}`,
    minChains && `min_chains=${minChains}`,
  ].filter(Boolean).join('&')

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-green-900 mb-1">البحث البحثي المتقدم</h1>
        <p className="text-sm text-gray-500">
          جمع المعايير: النص + الراوي + الباب + الكتاب + الدرجة + عدد الأسانيد
        </p>
      </div>

      <form action="/hadiths/advanced-research" method="get"
        className="bg-white rounded-xl border border-gray-100 p-5 mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs text-gray-500 block mb-1">نص الحديث (جزئي)</label>
            <input type="text" name="text" defaultValue={textQ}
              placeholder="مثال: الأعمال بالنيات، الطهور شطر..."
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">اسم الراوي (أي موضع في السند)</label>
            <input type="text" name="narrator" defaultValue={narratorQ}
              placeholder="مثال: الزهري، أبو هريرة..."
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">اسم الباب أو الموضوع</label>
            <input type="text" name="chapter" defaultValue={chapterQ}
              placeholder="مثال: الصلاة، الزكاة، الجنائز..."
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">الكتاب</label>
            <select name="book" defaultValue={bookId || ''}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400">
              <option value="">جميع الكتب</option>
              {books.map(b => (
                <option key={b.id} value={b.id}>{b.title}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">درجة الحديث</label>
            <select name="grade" defaultValue={gradeFilter}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400">
              <option value="">جميع الدرجات</option>
              <option value="sahih">صحيح فقط</option>
              <option value="hasan">حسن فقط</option>
              <option value="daif">ضعيف فقط</option>
              <option value="unjudged">غير محكوم عليه</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">الحد الأدنى لعدد الأسانيد</label>
            <select name="min_chains" defaultValue={minChains}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400">
              <option value="0">بدون حد أدنى</option>
              <option value="2">2 أسانيد فأكثر</option>
              <option value="3">3 أسانيد فأكثر</option>
              <option value="5">5 أسانيد فأكثر</option>
              <option value="10">10 أسانيد فأكثر</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3 items-center">
          <button type="submit"
            className="text-sm bg-green-800 text-white px-6 py-2.5 rounded-xl hover:bg-green-700 transition-colors font-medium">
            بحث
          </button>
          {hasSearch && (
            <a href="/hadiths/advanced-research" className="text-sm text-gray-400 hover:text-gray-600">
              × مسح الكل
            </a>
          )}
        </div>
      </form>

      {hasSearch && (
        <div className="flex flex-wrap gap-2 mb-4 text-xs items-center">
          {textQ && <span className="bg-green-50 text-green-800 border border-green-100 px-2 py-1 rounded-full">نص: {textQ}</span>}
          {narratorQ && <span className="bg-blue-50 text-blue-800 border border-blue-100 px-2 py-1 rounded-full">راوٍ: {narratorQ}</span>}
          {chapterQ && <span className="bg-amber-50 text-amber-800 border border-amber-100 px-2 py-1 rounded-full">باب: {chapterQ}</span>}
          {bookId && <span className="bg-purple-50 text-purple-800 border border-purple-100 px-2 py-1 rounded-full">كتاب محدد</span>}
          {gradeFilter && <span className="bg-teal-50 text-teal-800 border border-teal-100 px-2 py-1 rounded-full">{gradeFilter}</span>}
          {minChains > 0 && <span className="bg-orange-50 text-orange-800 border border-orange-100 px-2 py-1 rounded-full">أسانيد ≥ {minChains}</span>}
          <span className="text-gray-400">{totalCount.toLocaleString('ar-EG')} نتيجة</span>
        </div>
      )}

      {hasSearch ? (
        <div className="space-y-3">
          {results.map(h => (
            <div key={h.hadith_id}
              className="bg-white rounded-xl border border-gray-100 p-4 hover:border-green-200 hover:shadow-sm transition-all">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-xs font-medium text-gray-500">{h.book_title}</span>
                {h.chapter_text && <span className="text-xs text-gray-400">— {h.chapter_text}</span>}
                {h.companion_name && (
                  <span className="text-xs bg-amber-50 text-amber-800 border border-amber-100 px-2 py-0.5 rounded-full">
                    {h.companion_name}
                  </span>
                )}
                {h.best_judgment && (
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${judgmentColor(h.best_judgment)}`}>
                    {h.best_judgment.slice(0, 40)}
                  </span>
                )}
                <span className="text-xs text-gray-300 mr-auto">{h.chain_count} سند</span>
              </div>
              <p className="text-sm text-gray-900 leading-relaxed mb-2">
                {h.hadith_text}{h.hadith_text?.length === 300 && '...'}
              </p>
              <MatnMatchLine parts={h.snippet} />
              <div className="flex gap-3 text-xs">
                <Link href={`/hadith/${h.hadith_id}`} className="text-green-700 hover:underline">تفاصيل ←</Link>
                <Link href={`/hadith/${h.hadith_id}/research-report`} className="text-blue-600 hover:underline">تقرير ←</Link>
                {h.takhrij_group_id && (
                  <Link href={`/hadith/${h.hadith_id}/across-books`} className="text-indigo-600 hover:underline">مقارنة ←</Link>
                )}
              </div>
            </div>
          ))}
          {results.length === 0 && (
            <div className="bg-gray-50 rounded-xl p-8 text-center text-sm text-gray-400">
              لا توجد نتائج بهذه المعايير — جرب تقليل معايير البحث
            </div>
          )}
        </div>
      ) : (
        <div className="bg-green-50 border border-green-100 rounded-xl p-10 text-center">
          <UiIcon name="science" size={40} className="text-[#b28a43] mb-3 opacity-75" />
          <p className="text-sm text-green-800 font-medium mb-2">البحث البحثي المتقدم</p>
          <p className="text-xs text-green-600 max-w-sm mx-auto leading-relaxed">
            استخدم أي تركيبة من المعايير أعلاه — يمكنك البحث بالنص فقط، أو بالراوي فقط، أو بأي مجموعة منها
          </p>
        </div>
      )}

      {hasSearch && (results.length === pageSize || page > 1) && (
        <div className="flex gap-2 mt-5 justify-center">
          {page > 1 && (
            <a href={`/hadiths/advanced-research?${paramString}&page=${page - 1}`}
              className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg hover:border-green-300">
              ← السابق
            </a>
          )}
          <span className="text-sm text-gray-400 self-center">صفحة {page.toLocaleString('ar-EG')}</span>
          {results.length === pageSize && (
            <a href={`/hadiths/advanced-research?${paramString}&page=${page + 1}`}
              className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg hover:border-green-300">
              التالي →
            </a>
          )}
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/search" className="text-green-700 hover:underline">← البحث العادي</Link>
        <Link href="/takhrij" className="text-green-700 hover:underline">← محرك التخريج</Link>
        <Link href="/hadiths/fiqh-map" className="text-green-700 hover:underline">← خريطة الفقه</Link>
      </div>
    </div>
  )
}
