import pool from '@/lib/db'
import Link from 'next/link'
import UiIcon from '@/app/components/UiIcon'

export const dynamic = 'force-dynamic'

interface TakhrijGroup {
  group_id: number
  sample_text: string
  book_count: number
  chain_count: number
  companion_count: number
  grades: string | null
  books: string
  sample_hadith_id: number
  total_groups: number
}

interface TakhrijBook {
  book_name: string
  hadith_id: number
  judgment_text: string | null
  chain_count: number
}

export default async function TakhrijSpreadPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; minBooks?: string; page?: string; grade?: string }>
}) {
  const sp = await searchParams
  const selectedId = parseInt(sp.id || '0') || null
  const minBooks = parseInt(sp.minBooks || '3')
  const page = Math.max(1, parseInt(sp.page || '1'))
  const gradeFilter = sp.grade || ''
  const pageSize = 20
  const offset = (page - 1) * pageSize

  async function queryTakhrijGroups(sql: string, params: any[]) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      // The spread report deliberately uses a large grouped aggregate. Keep its
      // sort/hash work bounded so small Railway databases do not exhaust shared memory.
      await client.query("SET LOCAL max_parallel_workers_per_gather = 0")
      await client.query("SET LOCAL work_mem = '4MB'")
      const result = await client.query<TakhrijGroup>(sql, params)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }

  const [groupsRes, booksRes] = await Promise.all([
    queryTakhrijGroups(
      `WITH group_stats AS (
         SELECT t.group_id,
                MIN(t.hadith_id)::int AS seed_hadith_id,
                COUNT(DISTINCT ht.book_id)::int AS book_count,
                COUNT(DISTINCT ic.id)::int AS chain_count,
                COUNT(DISTINCT ic.narrator_id_array[1])
                  FILTER (WHERE n.is_companion)::int AS companion_count
         FROM takhrij t
         JOIN hadith_toc ht
           ON ht.main_id = t.hadith_id AND ht.is_leaf = true AND ht.is_paragraph = true
         LEFT JOIN isnad_hadiths ih ON ih.hadith_id = ht.main_id
         LEFT JOIN isnad_chains ic ON ic.id = ih.isnad_id
         LEFT JOIN narrators n ON n.id = ic.narrator_id_array[1]
         WHERE ($1 = '' OR EXISTS (
           SELECT 1
           FROM hadith_judgments j
           WHERE j.hadith_id = ht.main_id
             AND CASE
               WHEN j.say_text ~* 'صحيح' THEN 'صحيح'
               WHEN j.say_text ~* 'حسن' THEN 'حسن'
               WHEN j.say_text ~* 'ضعيف' THEN 'ضعيف'
               ELSE ''
             END = $1
         ))
         GROUP BY t.group_id
         HAVING COUNT(DISTINCT ht.book_id) >= $2
       ), paged_groups AS (
         SELECT gs.*, COUNT(*) OVER()::int AS total_groups
         FROM group_stats gs
         ORDER BY gs.book_count DESC, gs.chain_count DESC, gs.group_id
         LIMIT $3 OFFSET $4
       ), ranked_members AS (
         SELECT pg.*, m.hadith_id, m.book_id, m.book_name, m.book_death,
                m.chapter_text, m.hadith_text, m.member_rank
         FROM paged_groups pg
         CROSS JOIN LATERAL (
           SELECT
             t.hadith_id,
             t.book_id,
             b.title AS book_name,
             b.takhrij_death AS book_death,
             ht.chapter_text,
             LEFT(regexp_replace(COALESCE(ht.tarf, ''), '<[^>]+>', ' ', 'g'), 200) AS hadith_text,
             ROW_NUMBER() OVER (
               ORDER BY
                 (t.hadith_id = pg.seed_hadith_id) DESC,
                 b.takhrij_death ASC NULLS LAST,
                 t.hadith_id
             ) AS member_rank
           FROM takhrij t
           JOIN hadith_toc ht
             ON ht.main_id = t.hadith_id
            AND ht.is_leaf = true
            AND ht.is_paragraph = true
           JOIN books b ON b.id = t.book_id
           WHERE t.group_id = pg.group_id
           ORDER BY
             (t.hadith_id = pg.seed_hadith_id) DESC,
             b.takhrij_death ASC NULLS LAST,
             t.hadith_id
           LIMIT 12
         ) m
       )
       SELECT p.group_id, p.book_count, p.chain_count, p.companion_count, p.total_groups,
         COALESCE((
           SELECT LEFT(regexp_replace(COALESCE(ht2.tarf, ''), '<[^>]+>', ' ', 'g'), 200)
           FROM takhrij t2
           JOIN hadith_toc ht2 ON ht2.main_id = t2.hadith_id AND ht2.is_leaf = true AND ht2.is_paragraph = true
           WHERE t2.group_id = p.group_id
           ORDER BY ht2.main_id
           LIMIT 1
         ), '') AS sample_text,
         (
           SELECT string_agg(DISTINCT b2.title, '، ' ORDER BY b2.title)
           FROM takhrij t2
           JOIN books b2 ON b2.id = t2.book_id
           WHERE t2.group_id = p.group_id
         ) AS books,
         (
           SELECT string_agg(g.grade, '/' ORDER BY g.grade)
           FROM (
             SELECT DISTINCT CASE
               WHEN hj.say_text ~* 'صحيح' THEN 'صحيح'
               WHEN hj.say_text ~* 'حسن' THEN 'حسن'
               WHEN hj.say_text ~* 'ضعيف' THEN 'ضعيف'
               ELSE NULL
             END AS grade
             FROM takhrij t2
             JOIN hadith_judgments hj ON hj.hadith_id = t2.hadith_id
             WHERE t2.group_id = p.group_id
           ) g
           WHERE g.grade IS NOT NULL
         ) AS grades,
         (
           SELECT MIN(t2.hadith_id)
           FROM takhrij t2
           JOIN hadith_toc ht2 ON ht2.main_id = t2.hadith_id AND ht2.is_paragraph = true
           WHERE t2.group_id = p.group_id
         ) AS sample_hadith_id
       FROM ranked_members p
       ORDER BY p.book_count DESC, p.chain_count DESC, p.group_id`,
      [gradeFilter, minBooks, pageSize, offset]
    ),

    selectedId ? pool.query<TakhrijBook>(
      `SELECT DISTINCT ON (ht.main_id)
         b.title AS book_name,
         ht.main_id AS hadith_id,
         (SELECT hj.say_text FROM hadith_judgments hj WHERE hj.hadith_id = ht.main_id LIMIT 1) AS judgment_text,
         (SELECT COUNT(DISTINCT ic.id)::int FROM isnad_chains ic
          JOIN isnad_hadiths ih ON ih.isnad_id = ic.id WHERE ih.hadith_id = ht.main_id) AS chain_count
       FROM hadith_toc ht
       JOIN takhrij t ON t.hadith_id = ht.main_id
       JOIN books b ON b.id = ht.book_id
       WHERE t.group_id = $1
       ORDER BY ht.main_id, ht.book_id`,
      [selectedId]
    ).catch(() => ({ rows: [] as TakhrijBook[] })) : Promise.resolve({ rows: [] as TakhrijBook[] }),
  ])

  const groups = groupsRes.rows
  const totalGroups = Number(groups[0]?.total_groups || 0)
  const totalPages = Math.max(1, Math.ceil(totalGroups / pageSize))
  const takhrijBooks = booksRes.rows

  const selected = selectedId ? groups.find(g => g.group_id === selectedId) : null

  function judgmentColor(j: string | null) {
    if (!j) return 'text-gray-400'
    if (/صحيح/.test(j)) return 'text-green-700'
    if (/حسن/.test(j)) return 'text-blue-600'
    if (/ضعيف/.test(j)) return 'text-red-500'
    return 'text-gray-500'
  }

  function gradesColor(g: string | null) {
    if (!g) return 'text-gray-300'
    if (g === 'صحيح') return 'text-green-600'
    if (g.includes('صحيح') && g.includes('ضعيف')) return 'text-amber-600'
    if (/ضعيف/.test(g)) return 'text-red-500'
    return 'text-gray-500'
  }

  const MIN_BOOKS_OPTIONS = [2, 3, 5, 8, 10]
  const GRADE_OPTIONS = [
    { key: '', label: 'كل الأحكام' },
    { key: 'صحيح', label: 'صحيح' },
    { key: 'حسن', label: 'حسن' },
    { key: 'ضعيف', label: 'ضعيف' },
  ]

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-green-900 mb-1">الأحاديث المنتشرة عبر الكتب — بالتخريج</h1>
        <p className="text-sm text-gray-500">
          يرصد الأحاديث التي أُخرِجت في أكثر من كتاب بنفس التخريج — يكشف درجة الشهرة والانتشار ويسهل المقارنة بين روايات الكتب المختلفة
        </p>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <span className="text-xs text-gray-500">الحد الأدنى للكتب:</span>
        {MIN_BOOKS_OPTIONS.map(m => (
          <a key={m}
            href={`/hadiths/takhrij-spread?minBooks=${m}&grade=${gradeFilter}`}
            className={`text-xs px-3 py-1.5 rounded-full border ${minBooks === m ? 'bg-green-700 text-white border-green-700' : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'}`}>
            {m}+ كتب
          </a>
        ))}
        <span className="text-gray-200">|</span>
        {GRADE_OPTIONS.map(g => (
          <a key={g.key}
            href={`/hadiths/takhrij-spread?minBooks=${minBooks}&grade=${g.key}`}
            className={`text-xs px-3 py-1.5 rounded-full border ${gradeFilter === g.key ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-gray-600 border-gray-200 hover:border-amber-300'}`}>
            {g.label}
          </a>
        ))}
      </div>

      <div className="grid sm:grid-cols-5 gap-4">
        <div className="sm:col-span-3 space-y-2">
          {groups.map(g => (
            <a key={g.group_id}
              href={`/hadiths/takhrij-spread?id=${g.group_id}&minBooks=${minBooks}&grade=${gradeFilter}`}
              className={`block bg-white rounded-xl border px-4 py-3 hover:border-green-200 hover:shadow-sm transition-all ${selectedId === g.group_id ? 'border-green-300 shadow-sm' : 'border-gray-100'}`}>
              <div className="flex items-center gap-2 mb-2 flex-wrap text-xs">
                <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-medium">{g.book_count} كتب</span>
                <span className="text-gray-500">{g.chain_count} سند</span>
                {g.companion_count > 0 && <span className="text-amber-600">{g.companion_count} صحابي</span>}
                {g.grades && <span className={gradesColor(g.grades)}>{g.grades}</span>}
                <span className="text-xs text-gray-300 mr-auto">#{g.group_id}</span>
              </div>
              <p className="text-sm text-gray-900 leading-relaxed mb-2 line-clamp-2">{g.sample_text}...</p>
              <p className="text-xs text-gray-400 line-clamp-1">{g.books}</p>
            </a>
          ))}

          {groups.length === 0 && (
            <div className="bg-gray-50 rounded-xl p-8 text-center text-sm text-gray-400">
              لا توجد نتائج بهذه الفلاتر
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex gap-2 pt-2 justify-center">
              {page > 1 && (
                <a href={`/hadiths/takhrij-spread?minBooks=${minBooks}&grade=${gradeFilter}&page=${page - 1}`}
                  className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg hover:border-green-300">← السابق</a>
              )}
              <span className="text-sm text-gray-400 self-center">صفحة {page.toLocaleString('ar-EG')} من {totalPages.toLocaleString('ar-EG')}</span>
              {page < totalPages && (
                <a href={`/hadiths/takhrij-spread?minBooks=${minBooks}&grade=${gradeFilter}&page=${page + 1}`}
                  className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg hover:border-green-300">التالي →</a>
              )}
            </div>
          )}
        </div>

        <div className="sm:col-span-2">
          {selected && takhrijBooks.length > 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden sticky top-20">
              <div className="bg-green-50 px-4 py-3 border-b border-green-100">
                <div className="text-xs text-green-700 font-semibold mb-1">تخريج #{selected.group_id}</div>
                <p className="text-xs text-green-900 leading-relaxed line-clamp-3">{selected.sample_text}...</p>
                <div className="flex gap-2 mt-2">
                  <Link href={`/hadith/${selected.sample_hadith_id}`} className="text-xs text-green-700 hover:underline">تفاصيل ←</Link>
                  <Link href={`/hadith/${selected.sample_hadith_id}/research-report`} className="text-xs text-blue-600 hover:underline">تقرير ←</Link>
                </div>
              </div>
              <div className="divide-y divide-gray-50 max-h-[55vh] overflow-y-auto">
                {takhrijBooks.map((tb, i) => (
                  <div key={i} className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-800 font-medium flex-1">{tb.book_name}</span>
                      <span className="text-xs text-gray-400">{tb.chain_count} سند</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {tb.judgment_text && (
                        <span className={`text-xs ${judgmentColor(tb.judgment_text)}`}>{tb.judgment_text.slice(0, 20)}</span>
                      )}
                      <Link href={`/hadith/${tb.hadith_id}`}
                        className="text-xs text-green-700 hover:underline mr-auto">
                        ← الحديث
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-xl p-8 text-center">
              <UiIcon name="books" size={30} className="text-[#b28a43] mb-2" />
              <div className="text-sm text-gray-500 font-medium mb-2">مقارنة التخريج بين الكتب</div>
              <p className="text-xs text-gray-400 leading-relaxed">
                اختر حديثاً لمشاهدة جميع الكتب التي أخرجته — مع حكم كل كتاب وعدد أسانيده
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/hadiths/grade-by-book" className="text-green-700 hover:underline">← درجات الأحاديث بالكتاب</Link>
        <Link href="/hadiths/companion-overlap" className="text-green-700 hover:underline">← الأحاديث المشتركة للصحابة</Link>
        <Link href="/books" className="text-green-700 hover:underline">← الكتب</Link>
      </div>
    </div>
  )
}
