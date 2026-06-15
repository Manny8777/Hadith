import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'كاشف الانقطاع في الأسانيد — جامع خادم الحرمين' }

interface GapResult {
  hadith_id: number
  tarf: string | null
  book_title: string
  takhrij_author: string | null
  name1: string
  death1: number
  name2: string
  death2: number
  gap_years: number
  nar1_id: number
  nar2_id: number
}

const GAP_PRESETS = [
  { label: '50+ سنة', value: 50 },
  { label: '70+ سنة', value: 70 },
  { label: '100+ سنة', value: 100 },
  { label: '120+ سنة', value: 120 },
]

function gapColor(gap: number) {
  if (gap >= 120) return 'bg-red-700 text-white'
  if (gap >= 100) return 'bg-red-500 text-white'
  if (gap >= 70) return 'bg-orange-500 text-white'
  return 'bg-amber-400 text-white'
}

export default async function ChainGapsPage({
  searchParams,
}: {
  searchParams: Promise<{ min_gap?: string; book_id?: string }>
}) {
  const sp = await searchParams
  const minGap = Math.max(30, Math.min(200, parseInt(sp.min_gap || '70')))
  const bookId = sp.book_id ? parseInt(sp.book_id) : null

  const bookClause = bookId ? `AND b.id = $2` : ''
  const params: number[] = bookId ? [minGap, bookId] : [minGap]

  const [resultsRes, booksRes] = await Promise.all([
    pool.query<GapResult>(
      `WITH flat AS (
         SELECT ic.id AS chain_id,
                p.nar_id, p.ord
         FROM isnad_chains ic
         JOIN LATERAL unnest(ic.narrator_id_array) WITH ORDINALITY AS p(nar_id, ord) ON true
       ),
       pairs AS (
         SELECT chain_id, nar_id, ord,
                LEAD(nar_id) OVER (PARTITION BY chain_id ORDER BY ord) AS next_nar_id
         FROM flat
       ),
       worst_per_hadith AS (
         SELECT DISTINCT ON (ih.hadith_id)
                ih.hadith_id,
                n1.id AS nar1_id, n1.name AS name1, n1.death_year_num AS death1,
                n2.id AS nar2_id, n2.name AS name2, n2.death_year_num AS death2,
                (n2.death_year_num - n1.death_year_num) AS gap_years,
                p.chain_id
         FROM pairs p
         JOIN narrators n1 ON n1.id = p.nar_id
         JOIN narrators n2 ON n2.id = p.next_nar_id
         JOIN isnad_hadiths ih ON ih.isnad_id = p.chain_id
         WHERE p.next_nar_id IS NOT NULL
           AND n1.death_year_num IS NOT NULL
           AND n2.death_year_num IS NOT NULL
           AND (n2.death_year_num - n1.death_year_num) >= $1
         ORDER BY ih.hadith_id, (n2.death_year_num - n1.death_year_num) DESC
       )
       SELECT
         w.hadith_id, w.nar1_id, w.name1, w.death1,
         w.nar2_id, w.name2, w.death2, w.gap_years,
         regexp_replace(coalesce(ht.tarf,''), '<[^>]+>', ' ', 'g') AS tarf,
         b.title AS book_title, b.takhrij_author
       FROM worst_per_hadith w
       JOIN hadith_toc ht ON ht.main_id = w.hadith_id
       JOIN books b ON b.id = ht.book_id
       WHERE ht.is_leaf = true AND ht.is_paragraph = true
         ${bookClause}
       ORDER BY w.gap_years DESC
       LIMIT 60`,
      params
    ).catch(() => ({ rows: [] as GapResult[] })),

    pool.query<{ id: number; title: string; cnt: number }>(
      `SELECT b.id, b.title, COUNT(DISTINCT ih.hadith_id)::int AS cnt
       FROM books b
       JOIN hadith_toc ht ON ht.book_id = b.id AND ht.is_leaf AND ht.is_paragraph
       JOIN isnad_hadiths ih ON ih.hadith_id = ht.main_id
       JOIN isnad_chains ic ON ic.id = ih.isnad_id
       WHERE array_length(ic.narrator_id_array, 1) >= 2
       GROUP BY b.id, b.title
       ORDER BY cnt DESC
       LIMIT 20`
    ).catch(() => ({ rows: [] as { id: number; title: string; cnt: number }[] })),
  ])

  const results = resultsRes.rows
  const books = booksRes.rows

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams()
    p.set('min_gap', String(minGap))
    if (bookId) p.set('book_id', String(bookId))
    Object.entries(overrides).forEach(([k, v]) => {
      if (v) p.set(k, v); else p.delete(k)
    })
    return `/hadiths/chain-gaps?${p.toString()}`
  }

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-red-900 mb-1">كاشف الانقطاع في الأسانيد</h1>
        <p className="text-sm text-gray-500 mb-3">
          أحاديث تحتوي أسانيدها على فجوات زمنية كبيرة بين راوٍ وشيخه —
          مؤشر على الانقطاع المحتمل أو الإرسال في الإسناد
        </p>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-gray-500">الحد الأدنى للفجوة:</span>
          {GAP_PRESETS.map(g => (
            <Link key={g.value} href={buildUrl({ min_gap: String(g.value) })}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                minGap === g.value
                  ? 'bg-red-800 text-white border-red-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-red-300'
              }`}>
              {g.label}
            </Link>
          ))}
          <span className="text-xs text-gray-400 mr-auto">{results.length} حديث (أعلى 60 نتيجة)</span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <Link href={buildUrl({ book_id: '' })}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              !bookId ? 'bg-red-800 text-white border-red-800' : 'bg-white text-gray-600 border-gray-200 hover:border-red-300'
            }`}>
            كل الكتب
          </Link>
          {books.slice(0, 12).map(b => (
            <Link key={b.id} href={buildUrl({ book_id: String(b.id) })}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                bookId === b.id ? 'bg-red-700 text-white border-red-700' : 'bg-white text-gray-600 border-gray-200 hover:border-red-300'
              }`}>
              {b.title.slice(0, 20)}
            </Link>
          ))}
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-900">
        <span className="font-semibold">تنبيه منهجي: </span>
        الفجوة الزمنية الكبيرة بين وفاة راوٍ وشيخه لا تعني حتماً الانقطاع — قد يكون الراوي أدرك الشيخ في آخر عمره،
        أو كانت المعمرية موجودة. هذه النتائج أدوات بحثية تستدعي التحقق الفردي لكل إسناد.
        الفجوة المحسوبة هي الفرق بين وفاة الراوي التالي في السند ووفاة من يروي عنه.
      </div>

      <div className="space-y-3">
        {results.map((r) => (
          <Link key={r.hadith_id} href={`/hadith/${r.hadith_id}`}
            className="block bg-white rounded-xl border border-gray-100 px-4 py-4 hover:shadow-md hover:border-red-200 transition-all group">

            <div className="flex items-start gap-3 justify-between mb-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-green-700 font-medium">{r.book_title}</span>
                {r.takhrij_author && (
                  <span className="text-xs text-gray-400">{r.takhrij_author}</span>
                )}
              </div>
              <span className={`text-xs px-2.5 py-1 rounded-full font-bold shrink-0 ${gapColor(r.gap_years)}`}>
                فجوة {r.gap_years} سنة
              </span>
            </div>

            <p className="text-sm text-gray-700 leading-relaxed line-clamp-2 mb-3 group-hover:text-indigo-900">
              {(r.tarf || '').replace(/<[^>]+>/g, ' ').trim().slice(0, 200) || '...'}
            </p>

            {/* Gap visualization */}
            <div className="flex items-center gap-1 flex-wrap text-xs">
              <Link href={`/narrator/${r.nar1_id}`}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                className="text-blue-700 hover:underline font-medium">
                {r.name1}
              </Link>
              <span className="text-gray-400">ت {r.death1}هـ</span>
              <span className="text-gray-300 mx-1">→</span>
              <div className={`px-1.5 py-0.5 rounded text-xs font-bold ${gapColor(r.gap_years)}`}>
                {r.gap_years} سنة
              </div>
              <span className="text-gray-300 mx-1">→</span>
              <Link href={`/narrator/${r.nar2_id}`}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                className="text-blue-700 hover:underline font-medium">
                {r.name2}
              </Link>
              <span className="text-gray-400">ت {r.death2}هـ</span>
            </div>
          </Link>
        ))}
      </div>

      {results.length === 0 && (
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-8 text-center text-gray-500">
          لا توجد نتائج بهذه الفجوة
        </div>
      )}

      <div className="mt-6 bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-800">
        <p className="font-semibold mb-1">مفاهيم ذات صلة في علم الإسناد</p>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div>
            <span className="font-semibold">الانقطاع (إنقطاع السند):</span> سقوط راوٍ من السند دون وجود صلة مباشرة
          </div>
          <div>
            <span className="font-semibold">المرسل:</span> رواية التابعي عن النبي ﷺ دون ذكر الصحابي
          </div>
          <div>
            <span className="font-semibold">المعضل:</span> سقوط راويين أو أكثر متتاليين من السند
          </div>
          <div>
            <span className="font-semibold">المعمَّر:</span> الراوي الذي طال عمره جداً — يفسر بعض الفجوات
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/narrator-types" className="text-green-700 hover:underline">← علل الإسناد</Link>
        <Link href="/chains" className="text-green-700 hover:underline">← علو الإسناد</Link>
        <Link href="/narrators/chain-positions" className="text-green-700 hover:underline">← مواضع الإسناد</Link>
      </div>
    </div>
  )
}
