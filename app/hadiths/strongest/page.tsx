import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'أقوى الأحاديث — جامع خادم الحرمين' }

interface HadithRow {
  hadith_id: number
  hadith_text: string
  book_name: string
  book_count: number
  chain_count: number
  gold_chain_count: number
  sahih_count: number
  scholar_count: number
  companion_name: string | null
  strength_score: number
}

export default async function StrongestHadithsPage({
  searchParams,
}: {
  searchParams: Promise<{ min_books?: string; min_chains?: string; page?: string }>
}) {
  const sp = await searchParams
  const minBooks = Math.max(1, parseInt(sp.min_books || '2'))
  const minGoldChains = Math.max(0, parseInt(sp.min_chains || '1'))
  const page = Math.max(1, parseInt(sp.page || '1'))
  const pageSize = 20
  const offset = (page - 1) * pageSize

  const hadithsRes = await pool.query<HadithRow>(
    `WITH hadith_stats AS (
       SELECT
         ih.hadith_id,
         COUNT(DISTINCT ic.id)::int AS chain_count,
         COUNT(DISTINCT ic.id) FILTER (
           WHERE NOT EXISTS (
             SELECT 1 FROM unnest(ic.narrator_id_array) AS nar_id
             JOIN narrators nf ON nf.id = nar_id
             WHERE NOT (nf.is_companion = true OR nf.martaba_ibn_hajar ~* 'ثقة ثبت|ثقة حجة|إمام|أثبت')
           )
         )::int AS gold_chain_count
       FROM isnad_hadiths ih
       JOIN isnad_chains ic ON ic.id = ih.isnad_id
       GROUP BY ih.hadith_id
     ),
     hadith_judgments_agg AS (
       SELECT hadith_id,
              COUNT(*) FILTER (WHERE say_text ~* '^صحيح|^إسناده صحيح')::int AS sahih_count,
              COUNT(DISTINCT scientist_id)::int AS scholar_count
       FROM hadith_judgments
       WHERE say_text ~* 'صحيح'
       GROUP BY hadith_id
     ),
     hadith_books AS (
       SELECT DISTINCT ON (ht.takhrij_id)
              ht.main_id AS rep_hadith_id,
              ht.takhrij_id,
              COUNT(DISTINCT ht2.book_id)::int AS book_count,
              STRING_AGG(DISTINCT b2.title, '، ') AS books
       FROM hadith_toc ht
       JOIN hadith_toc ht2 ON ht2.takhrij_id = ht.takhrij_id
       JOIN books b2 ON b2.id = ht2.book_id
       WHERE ht.takhrij_id IS NOT NULL
       GROUP BY ht.takhrij_id, ht.main_id
       HAVING COUNT(DISTINCT ht2.book_id) >= $1
       ORDER BY ht.takhrij_id, ht.main_id
     )
     SELECT
       hb.rep_hadith_id AS hadith_id,
       LEFT(ht.tarf, 280) AS hadith_text,
       b.title AS book_name,
       hb.book_count,
       COALESCE(hs.chain_count, 0) AS chain_count,
       COALESCE(hs.gold_chain_count, 0) AS gold_chain_count,
       COALESCE(hj.sahih_count, 0) AS sahih_count,
       COALESCE(hj.scholar_count, 0) AS scholar_count,
       (SELECT n.name FROM isnad_chains ic
        JOIN isnad_hadiths ih ON ih.isnad_id = ic.id AND ih.hadith_id = hb.rep_hadith_id
        JOIN narrators n ON n.id = ic.narrator_id_array[1]
        WHERE n.is_companion = true LIMIT 1) AS companion_name,
       (COALESCE(hs.gold_chain_count, 0) * 4
        + COALESCE(hj.sahih_count, 0) * 3
        + COALESCE(hj.scholar_count, 0) * 2
        + hb.book_count * 2
        + COALESCE(hs.chain_count, 0))::int AS strength_score
     FROM hadith_books hb
     JOIN hadith_toc ht ON ht.main_id = hb.rep_hadith_id
     JOIN books b ON b.id = ht.book_id
     LEFT JOIN hadith_stats hs ON hs.hadith_id = hb.rep_hadith_id
     LEFT JOIN hadith_judgments_agg hj ON hj.hadith_id = hb.rep_hadith_id
     WHERE COALESCE(hs.gold_chain_count, 0) >= $2
     ORDER BY strength_score DESC
     LIMIT $3 OFFSET $4`,
    [minBooks, minGoldChains, pageSize, offset]
  ).catch(() => ({ rows: [] as HadithRow[] }))

  const hadiths = hadithsRes.rows

  function scoreColor(score: number) {
    if (score >= 30) return 'text-green-800 bg-green-100'
    if (score >= 20) return 'text-green-700 bg-green-50'
    if (score >= 10) return 'text-blue-700 bg-blue-50'
    return 'text-gray-600 bg-gray-50'
  }

  const CRITERIA = [
    'للحديث رواية في كتابَين أو أكثر',
    'له سند ذهبي (كل رواته ثقات أثبات)',
    'مُصحَّح من أكثر من عالم',
    'يرتفع تقييم كلما زادت هذه المعايير',
  ]

  return (
    <div dir="rtl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-green-900 mb-1">أقوى الأحاديث توثيقاً</h1>
        <p className="text-sm text-gray-500 mb-3">
          ترتيب مركَّب يجمع: الأسانيد الذهبية، تعدد التصحيح، تعدد الكتب، وكثرة الأسانيد
        </p>
        <div className="bg-green-50 border border-green-100 rounded-xl p-3 mb-3">
          <div className="text-xs font-semibold text-green-800 mb-1.5">معايير التقييم:</div>
          <ul className="text-xs text-green-700 space-y-1">
            {CRITERIA.map((c, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-green-500 mt-0.5">✓</span>
                {c}
              </li>
            ))}
          </ul>
          <p className="text-xs text-green-600 mt-2">
            <strong>التقييم =</strong> (سند ذهبي × 4) + (تصحيح عالم × 3) + (علماء مصحِّحون × 2) + (كتب × 2) + أسانيد
          </p>
        </div>
      </div>

      {/* Filters */}
      <form action="/hadiths/strongest" method="get"
        className="bg-white rounded-xl border border-gray-100 p-4 mb-5 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-gray-500 block mb-1">الحد الأدنى للكتب</label>
          <select name="min_books" defaultValue={minBooks}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400">
            {[1, 2, 3, 4, 5, 6].map(n => (
              <option key={n} value={n}>{n} كتاب{n === 1 ? '' : n <= 2 ? 'ان' : n <= 10 ? ' كتب' : ''}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">الحد الأدنى للأسانيد الذهبية</label>
          <select name="min_chains" defaultValue={minGoldChains}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400">
            {[0, 1, 2, 3, 5].map(n => (
              <option key={n} value={n}>{n === 0 ? 'بدون شرط' : `${n} أسانيد ذهبية`}</option>
            ))}
          </select>
        </div>
        <button type="submit"
          className="text-sm bg-green-800 text-white px-5 py-2 rounded-xl hover:bg-green-700 transition-colors">
          تطبيق
        </button>
      </form>

      {/* Results */}
      <div className="space-y-4">
        {hadiths.map((h, i) => (
          <div key={h.hadith_id}
            className="bg-white rounded-xl border border-gray-100 p-4 hover:border-green-200 hover:shadow-sm transition-all">
            <div className="flex items-start gap-3 mb-3">
              <div className="text-center shrink-0">
                <div className="text-lg font-bold text-gray-300">{((page - 1) * pageSize + i + 1).toLocaleString('ar-EG')}</div>
                <div className={`text-xs font-bold px-2 py-0.5 rounded-full mt-1 ${scoreColor(h.strength_score)}`}>
                  {h.strength_score}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="text-xs font-medium text-gray-500">{h.book_name}</span>
                  {h.companion_name && (
                    <span className="text-xs bg-amber-50 text-amber-800 border border-amber-100 px-2 py-0.5 rounded-full">
                      {h.companion_name}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-900 leading-relaxed mb-2">
                  {h.hadith_text}
                  {h.hadith_text?.length === 280 && '...'}
                </p>
              </div>
            </div>

            {/* Stats row */}
            <div className="flex flex-wrap gap-2 mb-3">
              {h.gold_chain_count > 0 && (
                <span className="text-xs bg-yellow-50 text-yellow-800 border border-yellow-200 px-2 py-1 rounded-full font-medium">
                  {h.gold_chain_count} سند ذهبي
                </span>
              )}
              {h.sahih_count > 0 && (
                <span className="text-xs bg-green-50 text-green-800 border border-green-200 px-2 py-1 rounded-full">
                  مُصحَّح {h.sahih_count}×
                </span>
              )}
              {h.scholar_count > 0 && (
                <span className="text-xs bg-blue-50 text-blue-800 border border-blue-200 px-2 py-1 rounded-full">
                  {h.scholar_count} عالم صحَّحه
                </span>
              )}
              <span className="text-xs bg-gray-50 text-gray-600 border border-gray-200 px-2 py-1 rounded-full">
                {h.book_count} كتاب
              </span>
              <span className="text-xs bg-gray-50 text-gray-600 border border-gray-200 px-2 py-1 rounded-full">
                {h.chain_count} سند
              </span>
            </div>

            <div className="flex gap-3 text-xs">
              <Link href={`/hadith/${h.hadith_id}`}
                className="text-green-700 hover:underline">تفاصيل الحديث ←</Link>
              <Link href={`/hadith/${h.hadith_id}/isnad-ranking`}
                className="text-blue-600 hover:underline">ترتيب الأسانيد ←</Link>
              <Link href={`/hadith/${h.hadith_id}/across-books`}
                className="text-indigo-600 hover:underline">مقارنة المصادر ←</Link>
              <Link href={`/hadith/${h.hadith_id}/research-report`}
                className="text-emerald-700 hover:underline">تقرير بحثي ←</Link>
            </div>
          </div>
        ))}
      </div>

      {hadiths.length === 0 && (
        <div className="bg-gray-50 rounded-xl p-8 text-center text-sm text-gray-400">
          لا توجد نتائج بهذه المعايير — جرب تقليل الحد الأدنى للكتب أو الأسانيد الذهبية
        </div>
      )}

      {(hadiths.length === pageSize || page > 1) && (
        <div className="flex gap-2 mt-5 justify-center">
          {page > 1 && (
            <a href={`/hadiths/strongest?min_books=${minBooks}&min_chains=${minGoldChains}&page=${page - 1}`}
              className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg hover:border-green-300">
              ← السابق
            </a>
          )}
          <span className="text-sm text-gray-400 self-center">صفحة {page.toLocaleString('ar-EG')}</span>
          {hadiths.length === pageSize && (
            <a href={`/hadiths/strongest?min_books=${minBooks}&min_chains=${minGoldChains}&page=${page + 1}`}
              className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg hover:border-green-300">
              التالي →
            </a>
          )}
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/hadiths/golden-chains" className="text-green-700 hover:underline">← الأسانيد الذهبية</Link>
        <Link href="/hadiths/in-all-six" className="text-green-700 hover:underline">← الجامعة للستة</Link>
        <Link href="/hadiths/companion-count" className="text-green-700 hover:underline">← المتواتر والغريب</Link>
      </div>
    </div>
  )
}
